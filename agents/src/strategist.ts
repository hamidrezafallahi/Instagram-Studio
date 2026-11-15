import {
  CHANNEL_LABEL_FA,
  Channel,
  ContentFormat,
  LocalTime,
  Slug,
  Weekday,
  type BrandProfile,
  type IndustryPack,
} from '@studio/contracts';
import { z } from 'zod';
import type { AgentRole } from './types.ts';

export interface StrategistInput {
  profile: BrandProfile;
  pack: IndustryPack;
  /** تاریخ شروع هفته به وقت برند (YYYY-MM-DD). */
  week_start: string;
}

export const PlanProposal = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        weekday: Weekday,
        channel: Channel,
        format: ContentFormat,
        pillar: Slug,
        topic_fa: z.string().min(1).max(300),
        goal_fa: z.string().max(300),
        cta_fa: z.string().max(300),
        local_time: LocalTime,
      }),
    )
    .max(60),
  notes_fa: z.array(z.string().max(400)).max(40),
});
export type PlanProposal = z.infer<typeof PlanProposal>;

/** شمارهٔ هفته از یک مبدأ ثابت؛ برای چرخش قطعی زاویه‌ها و CTAها بین هفته‌ها. */
function weekIndex(weekStart: string): number {
  const days = Temporal.PlainDate.from(weekStart).since(Temporal.PlainDate.from('2026-01-03')).days;
  return Math.floor(days / 7);
}

const pick = <T>(items: readonly T[], index: number): T | undefined =>
  items.length === 0 ? undefined : items[((index % items.length) + items.length) % items.length];

function proposePlan(input: StrategistInput): PlanProposal {
  const { profile, pack } = input;
  const notes: string[] = [
    'این برنامه پیشنهادی و قالبی است؛ موضوع، زمان و وضعیت هر آیتم را می‌توانید پیش از تولید پیش‌نویس تغییر دهید.',
  ];
  const pillars = new Map(pack.content_pillars.map((pillar) => [pillar.id, pillar]));
  const base = weekIndex(input.week_start);
  const disabled = new Set<string>();
  const needEvidence = new Set<string>();
  const entries: PlanProposal['entries'] = [];

  profile.cadence.forEach((slot, index) => {
    if (!profile.channels[slot.channel]?.enabled) {
      disabled.add(CHANNEL_LABEL_FA[slot.channel]);
      return;
    }
    const pillar = pillars.get(slot.pillar);
    if (!pillar) return;
    if (pillar.requires_evidence && profile.evidence.length === 0) {
      needEvidence.add(pillar.title_fa);
      return;
    }
    const offer = pick(profile.offers, base + index);
    const segment = pick(profile.audience.segments, base + index) ?? 'مخاطبان شما';
    const angle = pick(pillar.angles_fa, base + index) as string;
    const cta = pick(pack.cta_types, base + index);
    entries.push({
      weekday: slot.weekday,
      channel: slot.channel,
      format: slot.format,
      pillar: pillar.id,
      topic_fa: angle
        .replaceAll('{offer}', offer?.title ?? profile.identity.name)
        .replaceAll('{audience}', segment)
        .slice(0, 300),
      goal_fa: (profile.channels[slot.channel]?.goal_fa ?? pillar.description_fa).slice(0, 300),
      cta_fa: cta?.text_fa ?? '',
      local_time: slot.time,
    });
  });

  if (disabled.size > 0) {
    notes.push(`کانال غیرفعال است و آیتم‌های آن کنار گذاشته شد: ${[...disabled].join('، ')}.`);
  }
  if (needEvidence.size > 0) {
    notes.push(
      `این ستون‌ها فقط با مدرک واقعی قابل تولیدند و چون منبعی ثبت نشده از برنامه کنار گذاشته شدند: ${[...needEvidence].join('، ')}.`,
    );
  }
  if (entries.length === 0) {
    notes.push('هیچ آیتمی برای این هفته پیشنهاد نشد؛ الگوی هفته و کانال‌های فعال برند را بررسی کنید.');
  }
  return { entries, notes_fa: notes };
}

export const strategist: AgentRole<StrategistInput, PlanProposal> = {
  role: 'strategist',
  title_fa: 'برنامه‌ریز محتوا',
  prompt_version: 'strategist-template-1.0.0',
  output_schema: PlanProposal,
  max_calls: 1,
  timeout_ms: 10_000,
  allowed_modes: ['template'],
  tool_allowlist: [],
  authority_fa: 'فقط پیشنهاد برنامه؛ بدون تغییر بودجه و بدون انتشار.',
  template: proposePlan,
};
