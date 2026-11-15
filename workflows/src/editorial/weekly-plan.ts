import { StudioError } from '@studio/contracts';
import { strategist, toRequest } from '@studio/agents';
import { assessReadiness, faDate, faDigits } from '@studio/domain';
import type { RunContext, StepDefinition, WorkflowDefinition, WorkflowTools } from '../types.ts';

/** گام مشترک: بارگذاری برند و بررسی حداقل اطلاعات لازم برای draft. */
export const loadBrandStep: StepDefinition = {
  name: 'load_brand',
  title_fa: 'بارگذاری برند و بررسی آمادگی',
  timeout_ms: 10_000,
  async run(context: RunContext, tools: WorkflowTools) {
    const brand = await tools.loadBrand();
    const readiness = assessReadiness(brand.profile, brand.pack);
    if (!readiness.draft_ready) {
      throw new StudioError('BRAND_NOT_READY', {
        message_fa: `برای این کار هنوز این اطلاعات لازم است: ${readiness.missing_for_draft.join('، ')}.`,
        action_required: 'اطلاعات برند را در «راه‌اندازی برند» کامل کنید.',
      });
    }
    context.brand = brand;
    return {
      summary_fa: `برند «${brand.name}» نسخهٔ ${faDigits(brand.revision)} آماده است.`,
      output_ref: `brand_versions/${brand.id}/${brand.revision}`,
    };
  },
};

/**
 * W01 — برنامهٔ هفتگی (workflows/README.md):
 * انتخاب برند → بررسی اطلاعات → پیشنهاد برنامه → تقویم نسخه‌دار.
 * تأیید برنامه به معنی تأیید متن نهایی نیست.
 */
export const weeklyPlanWorkflow: WorkflowDefinition = {
  id: 'weekly_plan',
  version: '1.0.0',
  intent: 'build_weekly_plan',
  title_fa: 'ساخت برنامهٔ هفته',
  describeScope: ({ brand_name, week_start }) =>
    `پیشنهاد برنامهٔ هفتهٔ ${faDate(week_start)} برای «${brand_name}». فقط برنامه ساخته می‌شود؛ چیزی منتشر یا ارسال نمی‌شود. هزینه: صفر.`,
  steps: [
    loadBrandStep,
    {
      name: 'propose_plan',
      title_fa: 'پیشنهاد موضوع، قالب و زمان',
      timeout_ms: strategist.timeout_ms,
      async run(context, tools) {
        const brand = context.brand as NonNullable<RunContext['brand']>;
        const generated = await tools.model.generate(
          toRequest(strategist, { profile: brand.profile, pack: brand.pack, week_start: context.week_start }),
        );
        context.proposal = { value: generated.output, generator: generated.generator };
        return { summary_fa: `${faDigits(generated.output.entries.length)} آیتم پیشنهاد شد.` };
      },
    },
    {
      name: 'save_plan',
      title_fa: 'ذخیرهٔ برنامهٔ نسخه‌دار',
      timeout_ms: 10_000,
      async run(context, tools) {
        const brand = context.brand as NonNullable<RunContext['brand']>;
        const proposal = context.proposal as NonNullable<RunContext['proposal']>;
        const plan = await tools.savePlan({
          week_start: context.week_start,
          proposal: proposal.value,
          generator: proposal.generator,
          brand,
        });
        context.plan = plan;
        context.produced += 1;
        context.outcome.plan_id = plan.id;
        context.outcome.summary_fa =
          plan.entries.length === 0
            ? 'برنامه بدون آیتم ذخیره شد؛ یادداشت‌های برنامه دلیل را توضیح می‌دهند.'
            : `برنامهٔ هفته با ${faDigits(plan.entries.length)} آیتم ساخته شد (نسخهٔ ${faDigits(plan.version)}).`;
        return { summary_fa: context.outcome.summary_fa, output_ref: `plans/${plan.id}` };
      },
    },
  ],
};
