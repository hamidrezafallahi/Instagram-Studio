import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QaCheck } from '@studio/contracts';

/**
 * ساخت ویدئو با FFmpeg محلی (M3.4، ADR-033): اسلایدهای PNG با گذار محو → MP4 (H.264، yuv420p، ۳۰fps)
 * و یک ترک صدای خالی AAC برای سازگاری. موسیقی پیش‌فرض گذاشته نمی‌شود (مجوز).
 * خروجی قطعی است (bitexact، بدون فراداده) تا رندر دوباره همان فایل و همان checksum را بدهد.
 */

export interface VideoTools {
  ffmpeg: string;
  ffprobe: string;
}

export interface VideoFrame {
  png: Buffer;
  duration_s: number;
}

export const VIDEO_FPS = 30;
export const TRANSITION_S = 0.4;
export const VIDEO_VERSION = 'reel-slideshow-1';

function run(command: string, args: readonly string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} در زمان مقرر تمام نشد.`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} با کد ${code} پایان یافت: ${stderr.slice(-600)}`));
    });
  });
}

/** آیا ffmpeg و ffprobe اجرا می‌شوند؟ */
export async function videoToolsAvailable(tools: VideoTools): Promise<boolean> {
  try {
    await run(tools.ffmpeg, ['-hide_banner', '-version'], 10_000);
    await run(tools.ffprobe, ['-hide_banner', '-version'], 10_000);
    return true;
  } catch {
    return false;
  }
}

/** آرگومان‌های FFmpeg برای اسلایدشو؛ جدا برای آزمون. مدت کل = مجموع مدت فریم‌ها. */
export function slideshowArgs(files: readonly string[], durations: readonly number[], output: string): string[] {
  const n = files.length;
  const t = n > 1 ? TRANSITION_S : 0;
  const total = durations.reduce((sum, value) => sum + value, 0);
  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y'];
  files.forEach((file, index) => {
    // هر کلیپ (جز آخری) به اندازهٔ گذار بلندتر است تا هم‌پوشانی xfade از مدت فریم کم نکند.
    const length = (durations[index] as number) + (index < n - 1 ? t : 0);
    args.push('-loop', '1', '-framerate', String(VIDEO_FPS), '-t', length.toFixed(3), '-i', file);
  });
  args.push('-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

  const filters: string[] = files.map((_, index) => `[${index}:v]format=yuv420p,setsar=1,fps=${VIDEO_FPS}[v${index}]`);
  let last = 'v0';
  let offset = 0;
  for (let index = 1; index < n; index += 1) {
    offset += durations[index - 1] as number;
    const out = `x${index}`;
    filters.push(`[${last}][v${index}]xfade=transition=fade:duration=${t}:offset=${offset.toFixed(3)}[${out}]`);
    last = out;
  }
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${last}]`, '-map', `${n}:a`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-r', String(VIDEO_FPS), '-g', String(VIDEO_FPS * 2),
    '-c:a', 'aac', '-b:a', '128k',
    '-t', total.toFixed(3),
    '-movflags', '+faststart',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    output,
  );
  return args;
}

/** ساخت MP4 از فریم‌ها در پوشهٔ موقت؛ پوشه پس از کار پاک می‌شود. */
export async function encodeSlideshow(tools: VideoTools, frames: readonly VideoFrame[]): Promise<Buffer> {
  if (frames.length === 0) throw new Error('هیچ فریمی برای ویدئو نیست.');
  const dir = await mkdtemp(join(tmpdir(), 'studio-video-'));
  try {
    const files: string[] = [];
    for (const [index, frame] of frames.entries()) {
      const file = join(dir, `frame-${String(index).padStart(3, '0')}.png`);
      await writeFile(file, frame.png);
      files.push(file);
    }
    const output = join(dir, 'out.mp4');
    await run(tools.ffmpeg, slideshowArgs(files, frames.map((frame) => frame.duration_s), output), 300_000);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

export interface VideoProbe {
  duration_ms: number;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  pix_fmt: string | null;
  fps: number | null;
  audio_codec: string | null;
}

/** مشخصات واقعی فایل از ffprobe؛ فایلی که ffprobe نخواند خطا می‌دهد. */
export async function probeMedia(tools: VideoTools, data: Buffer, ext = 'mp4'): Promise<VideoProbe> {
  const dir = await mkdtemp(join(tmpdir(), 'studio-probe-'));
  try {
    const file = join(dir, `input.${ext.replace(/[^a-z0-9]/gi, '')}`);
    await writeFile(file, data);
    const { stdout } = await run(
      tools.ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      30_000,
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string; avg_frame_rate?: string }[];
    };
    const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
    const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
    const rate = video?.avg_frame_rate?.split('/').map(Number);
    const duration = Number(parsed.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('مدت فایل خوانده نشد.');
    return {
      duration_ms: Math.round(duration * 1000),
      width: video?.width ?? null,
      height: video?.height ?? null,
      video_codec: video?.codec_name ?? null,
      pix_fmt: video?.pix_fmt ?? null,
      fps: rate && rate[1] ? Math.round(((rate[0] as number) / rate[1]) * 100) / 100 : null,
      audio_codec: audio?.codec_name ?? null,
    };
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

const check = (id: string, severity: QaCheck['severity'], passed: boolean, message_fa: string): QaCheck => ({
  id, severity, passed, message_fa,
});

/** QA فنی ریلز از روی خود فایل (نه از روی ورودی). */
export function videoChecks(probe: VideoProbe, expected: { width: number; height: number; duration_s: number; cues: number; frames: number }): QaCheck[] {
  const seconds = probe.duration_ms / 1000;
  return [
    check(
      'video_format',
      'error',
      probe.video_codec === 'h264' && probe.pix_fmt === 'yuv420p' && probe.width === expected.width && probe.height === expected.height,
      `ویدئو ${probe.video_codec ?? '?'} ${probe.pix_fmt ?? '?'} با ابعاد ${probe.width ?? '?'}×${probe.height ?? '?'} است (انتظار: h264 yuv420p ${expected.width}×${expected.height}).`,
    ),
    check('video_audio', 'error', probe.audio_codec === 'aac', probe.audio_codec === 'aac' ? 'ترک صدای AAC (خالی) دارد.' : 'ترک صدای AAC ندارد.'),
    check(
      'video_duration',
      'error',
      Math.abs(seconds - expected.duration_s) <= 0.25,
      `مدت ویدئو ${seconds.toFixed(1)} ثانیه است (برنامه: ${expected.duration_s.toFixed(1)}).`,
    ),
    check(
      'video_length_range',
      'warning',
      seconds >= 5 && seconds <= 90,
      seconds >= 5 && seconds <= 90
        ? 'مدت ویدئو در بازهٔ رایج ریلز است.'
        : 'مدت ویدئو بیرون از بازهٔ رایج ۵ تا ۹۰ ثانیه است؛ پیش از انتشار سقف فعلی پلتفرم را بررسی کنید.',
    ),
    check(
      'video_subtitles',
      'error',
      expected.cues === expected.frames,
      expected.cues === expected.frames ? 'برای هر فریم یک زیرنویس هم‌زمان ساخته شد.' : 'تعداد زیرنویس با فریم‌ها نمی‌خواند.',
    ),
  ];
}
