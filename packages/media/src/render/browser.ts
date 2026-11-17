import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * رندر HTML به PNG با Chrome/Edge نصب‌شده در حالت headless، از طریق پروتکل DevTools (CDP)
 * و WebSocket داخلی Node؛ بدون بستهٔ npm و بدون دانلود Chromium (ADR-032).
 * صفحه هیچ دسترسی شبکه‌ای ندارد و اسکریپت صفحه اجرا نمی‌شود؛ فونت و تصویر به‌صورت data: جاسازی می‌شوند.
 */

const CANDIDATES: Record<string, string[]> = {
  win32: [
    join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['LOCALAPPDATA'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
};

/** مسیر مرورگر: STUDIO_BROWSER_PATH یا جست‌وجوی مسیرهای معمول؛ نبودش یعنی رندر degraded. */
export function findBrowser(explicit?: string): string | null {
  if (explicit) return existsSync(explicit) ? explicit : null;
  return (CANDIDATES[process.platform] ?? []).find((path) => path && existsSync(path)) ?? null;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface RenderOutput<T> {
  png: Buffer;
  /** نتیجهٔ اسکریپت سنجش (QA بصری) که پس از بارگیری فونت‌ها در صفحه اجرا شد. */
  measure: T;
}

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

class CdpConnection {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number; result?: Record<string, unknown>; error?: { message: string };
      };
      if (message.id === undefined) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(`CDP: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('اتصال مرورگر بسته شد.'));
      this.#pending.clear();
    });
  }

  static open(url: string): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolve(new CdpConnection(socket)), { once: true });
      socket.addEventListener('error', () => reject(new Error('اتصال به مرورگر برقرار نشد.')), { once: true });
    });
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close(): void {
    this.#socket.close();
  }
}

/** یک نمونهٔ مرورگر headless برای چند رندر پشت‌سرهم؛ پس از کار حتماً close شود. */
export class HtmlRenderer {
  readonly #process: ChildProcess;
  readonly #cdp: CdpConnection;
  readonly #profileDir: string;
  readonly #timeoutMs: number;

  private constructor(child: ChildProcess, cdp: CdpConnection, profileDir: string, timeoutMs: number) {
    this.#process = child;
    this.#cdp = cdp;
    this.#profileDir = profileDir;
    this.#timeoutMs = timeoutMs;
  }

  static async launch(browserPath: string, options: { timeoutMs?: number } = {}): Promise<HtmlRenderer> {
    const profileDir = await mkdtemp(join(tmpdir(), 'studio-render-'));
    const child = spawn(
      browserPath,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-component-update',
        '--disable-default-apps',
        '--mute-audio',
        '--hide-scrollbars',
        '--force-color-profile=srgb',
        '--font-render-hinting=none',
        // هیچ نام میزبانی resolve نمی‌شود؛ لایهٔ دوم در کنار مسدودسازی URL در خود صفحه.
        '--host-resolver-rules=MAP * ~NOTFOUND',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    try {
      const wsUrl = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => reject(new Error('مرورگر در زمان مقرر آماده نشد.')), 20_000);
        child.stderr?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
          if (match?.[1]) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`مرورگر پیش از آماده‌شدن بسته شد (کد ${code}).`));
        });
      });
      const cdp = await CdpConnection.open(wsUrl);
      return new HtmlRenderer(child, cdp, profileDir, options.timeoutMs ?? 30_000);
    } catch (error) {
      child.kill();
      await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async #withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('رندر در زمان مقرر تمام نشد.')), this.#timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * رندر یک سند HTML کامل در ابعاد ثابت. `measureExpression` یک عبارت JS است که پس از آماده‌شدن
   * فونت‌ها در صفحه ارزیابی و نتیجه‌اش (JSON) برگردانده می‌شود.
   */
  async render<T>(html: string, viewport: Viewport, measureExpression = 'null'): Promise<RenderOutput<T>> {
    const cdp = this.#cdp;
    const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    try {
      return await this.#withTimeout(
        (async () => {
          const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })) as {
            sessionId: string;
          };
          const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
          await send('Page.enable');
          await send('Network.enable');
          await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'file://*', 'ftp://*'] });
          await send('Emulation.setScriptExecutionDisabled', { value: true });
          await send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: false,
          });
          const tree = (await send('Page.getFrameTree')) as { frameTree: { frame: { id: string } } };
          await send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html });
          const ready = (await send('Runtime.evaluate', {
            expression:
              'Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode().catch(() => null))])' +
              '.then(() => document.fonts.status)',
            awaitPromise: true,
            returnByValue: true,
          })) as { result: { value?: string } };
          if (ready.result.value !== 'loaded') throw new Error('فونت‌های قالب بارگیری نشدند.');
          const measured = (await send('Runtime.evaluate', {
            expression: measureExpression,
            awaitPromise: true,
            returnByValue: true,
          })) as { result: { value?: T }; exceptionDetails?: { text: string } };
          if (measured.exceptionDetails) throw new Error(`سنجش صفحه شکست خورد: ${measured.exceptionDetails.text}`);
          const shot = (await send('Page.captureScreenshot', {
            format: 'png',
            clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 1 },
            captureBeyondViewport: false,
          })) as { data: string };
          return { png: Buffer.from(shot.data, 'base64'), measure: measured.result.value as T };
        })(),
      );
    } finally {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.#cdp.send('Browser.close').catch(() => undefined);
    this.#cdp.close();
    if (this.#process.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.#process.kill();
          resolve();
        }, 3000);
        this.#process.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    // پوشهٔ پروفایل موقت؛ ویندوز ممکن است چند لحظه قفلش نگه دارد.
    await rm(this.#profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
}
