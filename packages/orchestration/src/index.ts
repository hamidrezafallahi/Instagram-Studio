import { ModelGateway, createOpenRouterProvider, templateProvider, type ModelProvider } from '@studio/ai';
import { loadCapabilityRegister, loadIndustryPacks, summarizePack, type RuntimeConfig } from '@studio/config';
import { ConnectorRegistry } from '@studio/connectors';
import { createFakeConnector, FakeProviderState } from '@studio/connector-fake';
import { StudioError, type IndustryPack, type IndustryPackSummary } from '@studio/contracts';
import { join } from 'node:path';
import { Database } from '@studio/data';
import { AssetStore, findBrowser, loadVazirmatn } from '@studio/media';
import { createLogger, createVault, loadMasterKey, processScrubber, type Logger } from '@studio/security';
import { createAssetService } from './assets.ts';
import { createAuthService } from './auth.ts';
import { createBrandImportService } from './brand-import.ts';
import { createBrandService } from './brands.ts';
import { createConnectionService } from './connections.ts';
import type { StudioDeps } from './context.ts';
import { createExecutionService, type ExecutionFaults } from './execution.ts';
import { createPlanningService } from './planning.ts';
import { createReportService } from './reports.ts';
import { createRunService } from './runs.ts';
import { createSampleDataService } from './sample-data.ts';
import { createVisualService } from './visuals.ts';

export type { Access, AuthenticatedSession, IssuedSession } from './auth.ts';
export type { AssetFile } from './assets.ts';
export { reelOutputs, type RenderedOutput } from './visuals.ts';
export {
  BRANDS_DIR,
  buildSeedProfile,
  loadBrandSeeds,
  type BrandImportOutcome,
  type LoadedBrandSeed,
} from './brand-import.ts';
export { PUBLISH_GRACE_MS, actionTypeFor, type ExecutionFaults } from './execution.ts';
export type { Actor, BrandCall, Principal, StudioDeps, WorkspaceCall } from './context.ts';

/**
 * لایهٔ سرویس مشترک استودیو (ADR-008، ADR-021). API، و بعداً worker، MCP و پیام‌رسان مالک،
 * همگی همین شیء را می‌سازند؛ هیچ ورودی مسیر میان‌بری به داده یا کانکتور ندارد.
 */
export function createStudio(deps: StudioDeps, options: { faults?: ExecutionFaults } = {}) {
  const auth = createAuthService(deps);
  const brands = createBrandService(deps);
  const connections = createConnectionService(deps);
  const execution = createExecutionService(deps, brands, connections, options.faults);
  const planning = createPlanningService(deps, brands, { onRevision: execution.invalidateForRevision });
  const visuals = createVisualService(deps, brands, { onRevision: execution.invalidateForRevision });
  const runs = createRunService(deps, brands, connections, visuals);
  const reports = createReportService(deps, brands);
  const sampleData = createSampleDataService(deps, brands, connections);
  const brandImport = createBrandImportService(deps, brands);
  const assets = createAssetService(deps, brands);

  return {
    deps,
    auth,
    assets,
    brands,
    brandImport,
    connections,
    planning,
    execution,
    runs,
    reports,
    sampleData,
    catalog: {
      listPacks: (): IndustryPackSummary[] => [...deps.packs.values()].map(summarizePack),
      getPack(packId: string): IndustryPack {
        const pack = deps.packs.get(packId);
        if (!pack) throw new StudioError('NOT_FOUND', { message_fa: 'بستهٔ صنعت پیدا نشد.' });
        return pack;
      },
    },
    async ready(): Promise<void> {
      await deps.db.ping();
    },
    async close(): Promise<void> {
      await deps.db.close();
    },
  };
}

export type Studio = ReturnType<typeof createStudio>;

export interface StudioOptions {
  config: RuntimeConfig;
  databaseUrl: string;
  logger?: Logger;
  now?: () => Date;
  /** حالت «سمت ارائه‌دهنده» کانکتور نمونه؛ در آزمون برای بررسی تعداد فراخوانی تزریق می‌شود. */
  fakeState?: FakeProviderState;
  masterKey?: Buffer;
  /** فقط آزمون: تزریق خطا در worker. */
  faults?: ExecutionFaults;
  applicationName?: string;
  /** فقط آزمون: درگاه مدل تزریقی (مثلاً provider ساختگی بدون شبکه). */
  models?: ModelGateway;
  /** ریشهٔ ذخیرهٔ دارایی؛ پیش‌فرض STUDIO_HOME/assets. */
  assetRoot?: string;
}

/**
 * درگاه مدل بر اساس تنظیمات: OpenRouter فقط با مدل‌های رایگان و کلید STUDIO_HOME، با fallback قالبی.
 * کلید فقط از محیط فرایند خوانده و در scrubber ثبت می‌شود تا در هیچ log یا خطایی نیاید.
 */
export function createModelGateway(config: RuntimeConfig, env: NodeJS.ProcessEnv = process.env): ModelGateway {
  const apiKey = env['OPENROUTER_API_KEY']?.trim();
  if (config.textModel !== 'openrouter' || !apiKey) return new ModelGateway([templateProvider]);
  processScrubber.register(apiKey);
  const providers: ModelProvider[] = [
    createOpenRouterProvider({ apiKey, models: config.openrouterModels }),
    templateProvider,
  ];
  return new ModelGateway(providers, { default_modes: ['free_api', 'template'] });
}

/** composition root مشترک: همهٔ وابستگی‌ها از تنظیمات اجرا ساخته می‌شوند. */
export function createStudioFromConfig(options: StudioOptions): Studio {
  const { config } = options;
  const connectors = new ConnectorRegistry();
  // تنها adapter اجرایی این نسخه کانکتور نمونه است؛ کانکتورهای واقعی فقط پس از اثبات اضافه می‌شوند.
  connectors.register(createFakeConnector(options.fakeState ?? new FakeProviderState()));
  return createStudio({
    db: new Database(options.databaseUrl, { applicationName: options.applicationName ?? 'studio-api' }),
    vault: createVault(options.masterKey ?? loadMasterKey(config.home)),
    packs: loadIndustryPacks(),
    register: loadCapabilityRegister(),
    connectors,
    models: options.models ?? createModelGateway(config),
    assets: new AssetStore(options.assetRoot ?? join(config.home, 'assets')),
    render: {
      browserPath: findBrowser(config.browserPath),
      video: { ffmpeg: config.ffmpegPath ?? 'ffmpeg', ffprobe: config.ffprobePath ?? 'ffprobe' },
      fontBase64: (() => {
        let cached: string | null = null;
        return () => (cached ??= loadVazirmatn(config.repoRoot));
      })(),
    },
    logger: options.logger ?? createLogger({ service: 'studio', level: config.logLevel }),
    settings: { profile: config.profile, sampleData: config.sampleData, sessionTtlHours: 24 * 7 },
    now: options.now ?? (() => new Date()),
  }, { faults: options.faults });
}
