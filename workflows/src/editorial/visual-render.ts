import { isStudioError } from '@studio/contracts';
import { faDate, faDigits } from '@studio/domain';
import type { WorkflowDefinition } from '../types.ts';

/**
 * W03 — ساخت تصویر (M3.3): متن نسخهٔ جاری → اسلاید → قالب برند → PNG → QA بصری → نسخهٔ تازهٔ محتوا.
 * رندر محلی و بدون هزینه است؛ چیزی منتشر نمی‌شود. تصویر تازه نسخهٔ تازه است و تأیید قبلی را باطل می‌کند.
 * شکست یک محتوا بقیه را متوقف نمی‌کند.
 */
export const visualRenderWorkflow: WorkflowDefinition = {
  id: 'visual_render',
  version: '1.0.0',
  intent: 'render_visuals',
  title_fa: 'ساخت تصویر',
  describeScope: ({ brand_name, week_start, params }) =>
    params.content_ids?.length
      ? `ساخت تصویر برای ${faDigits(params.content_ids.length)} محتوای انتخابی «${brand_name}» با قالب برند. رندر محلی؛ چیزی منتشر نمی‌شود. هزینه: صفر.`
      : `ساخت تصویر برای محتوای تصویری هفتهٔ ${faDate(week_start)} برند «${brand_name}» که هنوز تصویر ندارد. رندر محلی؛ چیزی منتشر نمی‌شود. هزینه: صفر.`,
  steps: [
    {
      name: 'load_brand',
      title_fa: 'بارگذاری برند',
      timeout_ms: 10_000,
      async run(context, tools) {
        context.brand = await tools.loadBrand();
        return { summary_fa: `برند «${context.brand.name}» بارگذاری شد.` };
      },
    },
    {
      name: 'select_content',
      title_fa: 'انتخاب محتوای تصویری',
      timeout_ms: 10_000,
      async run(context, tools) {
        const { candidates, skipped } = await tools.listRenderable(context.week_start, context.params.content_ids);
        context.renderables = candidates;
        context.outcome.skipped.push(...skipped);
        return { summary_fa: `${faDigits(candidates.length)} محتوا برای ساخت تصویر انتخاب شد.` };
      },
    },
    {
      name: 'render',
      title_fa: 'رندر و بازبینی بصری',
      timeout_ms: 600_000,
      async run(context, tools) {
        let ready = 0;
        let failed = 0;
        for (const candidate of context.renderables ?? []) {
          try {
            const result = await tools.renderContent(candidate.content_id);
            if (result.skipped_reason_fa) {
              context.outcome.skipped.push({ ref: candidate.content_id, reason_fa: result.skipped_reason_fa });
              continue;
            }
            context.outcome.content_ids.push(candidate.content_id);
            context.produced += 1;
            if (result.qa_status === 'fail') failed += 1;
            else ready += 1;
          } catch (error) {
            context.outcome.skipped.push({
              ref: candidate.content_id,
              reason_fa: isStudioError(error) ? error.message_fa : 'خطای پیش‌بینی‌نشده در ساخت تصویر این محتوا.',
            });
            if (!isStudioError(error)) throw error;
            context.failures.push({ code: error.code, message_fa: error.message_fa });
          }
        }
        const total = context.outcome.content_ids.length;
        context.outcome.summary_fa =
          total === 0
            ? 'محتوایی برای ساخت تصویر نبود.'
            : `برای ${faDigits(total)} محتوا تصویر ساخته شد: ${faDigits(ready)} آمادهٔ بازبینی و ${faDigits(failed)} نیازمند اصلاح.`;
        return { summary_fa: context.outcome.summary_fa };
      },
    },
  ],
};
