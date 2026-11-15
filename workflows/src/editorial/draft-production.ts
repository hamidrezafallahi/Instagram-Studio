import { isStudioError } from '@studio/contracts';
import { copywriter, editorQa, toRequest } from '@studio/agents';
import { faDate, faDigits } from '@studio/domain';
import type { RunContext, WorkflowDefinition } from '../types.ts';
import { loadBrandStep } from './weekly-plan.ts';

/**
 * W02 — تولید پیش‌نویس (تا پیش از تأیید):
 * brief → متن → QA ادعا/لحن/فنی → آمادهٔ بازبینی یا نیاز به اصلاح.
 * انتشار در این گردش‌کار نیست؛ از ActionIntent و executor جدا می‌گذرد (M2).
 * شکست یک آیتم باعث توقف یا تکرار آیتم‌های موفق نمی‌شود.
 */
export const draftProductionWorkflow: WorkflowDefinition = {
  id: 'draft_production',
  version: '1.0.0',
  intent: 'generate_drafts',
  title_fa: 'تولید پیش‌نویس',
  describeScope: ({ brand_name, week_start, params }) =>
    params.schedule_entry_ids?.length
      ? `تولید پیش‌نویس برای ${faDigits(params.schedule_entry_ids.length)} آیتم انتخابی «${brand_name}». فقط پیش‌نویس داخلی؛ چیزی منتشر نمی‌شود. هزینه: صفر (تولید قالبی محلی).`
      : `تولید پیش‌نویس برای آیتم‌های بدون محتوای هفتهٔ ${faDate(week_start)} برند «${brand_name}». فقط پیش‌نویس داخلی؛ چیزی منتشر نمی‌شود. هزینه: صفر (تولید قالبی محلی).`,
  steps: [
    loadBrandStep,
    {
      name: 'select_entries',
      title_fa: 'انتخاب آیتم‌های تقویم',
      timeout_ms: 10_000,
      async run(context, tools) {
        const plan = await tools.currentPlan(context.week_start);
        if (!plan) {
          context.entries = [];
          context.outcome.summary_fa = 'برای این هفته برنامه‌ای وجود ندارد؛ ابتدا «ساخت برنامه» را اجرا کنید.';
          return { summary_fa: context.outcome.summary_fa };
        }
        context.plan = plan;
        context.outcome.plan_id = plan.id;
        const wanted = context.params.schedule_entry_ids;
        const selected = plan.entries.filter((entry) =>
          wanted?.length ? wanted.includes(entry.id) : entry.status === 'planned',
        );
        for (const id of wanted ?? []) {
          if (!plan.entries.some((entry) => entry.id === id)) {
            context.outcome.skipped.push({ ref: id, reason_fa: 'این آیتم در برنامهٔ جاری هفته نیست.' });
          }
        }
        context.entries = selected.filter((entry) => {
          if (entry.status === 'planned') return true;
          context.outcome.skipped.push({
            ref: entry.id,
            reason_fa: entry.status === 'drafted' ? 'این آیتم قبلاً پیش‌نویس دارد.' : 'این آیتم از برنامه کنار گذاشته شده است.',
          });
          return false;
        });
        return { summary_fa: `${faDigits(context.entries.length)} آیتم برای تولید انتخاب شد.` };
      },
    },
    {
      name: 'produce_drafts',
      title_fa: 'نگارش و بازبینی خودکار',
      timeout_ms: 120_000,
      async run(context, tools) {
        const brand = context.brand as NonNullable<RunContext['brand']>;
        let ready = 0;
        let needsRevision = 0;
        for (const entry of context.entries ?? []) {
          try {
            const draft = await tools.model.generate(
              toRequest(copywriter, {
                profile: brand.profile,
                pack: brand.pack,
                brand_revision: brand.revision,
                entry: {
                  channel: entry.channel,
                  format: entry.format,
                  pillar: entry.pillar,
                  topic_fa: entry.topic_fa,
                  goal_fa: entry.goal_fa,
                  cta_fa: entry.cta_fa,
                },
              }),
            );
            const limits = await tools.textLimits(entry.channel);
            const qa = await tools.model.generate(
              toRequest(editorQa, {
                text: draft.output.text,
                format: entry.format,
                cta_fa: entry.cta_fa,
                profile: brand.profile,
                pack: brand.pack,
                is_sample: brand.is_sample,
                checked_at: tools.now().toISOString(),
                ...(limits ? { limits } : {}),
              }),
            );
            const passed = qa.output.qa_result.status !== 'fail';
            const saved = await tools.saveDraft({
              entry,
              brief: {
                goal: entry.goal_fa || entry.topic_fa,
                audience: brand.profile.audience.summary,
                pillar: entry.pillar,
                channel: entry.channel,
                format: entry.format,
                source_ids: draft.output.source_refs.map((ref) => ref.source_id),
                cta: entry.cta_fa,
                due_at: entry.scheduled_at_utc,
              },
              title_fa: draft.output.title_fa,
              text: draft.output.text,
              source_refs: draft.output.source_refs,
              claims: qa.output.claims,
              qa_result: qa.output.qa_result,
              generator: draft.generator,
              final_state: passed ? 'ready_for_review' : 'needs_revision',
            });
            if (!saved) {
              context.outcome.skipped.push({ ref: entry.id, reason_fa: 'این آیتم قبلاً پیش‌نویس دارد.' });
              continue;
            }
            context.outcome.content_ids.push(saved.content_id);
            context.produced += 1;
            if (passed) ready += 1;
            else needsRevision += 1;
          } catch (error) {
            // شکست یک آیتم بقیه را متوقف نمی‌کند؛ دلیل صادقانه ثبت می‌شود.
            context.outcome.skipped.push({
              ref: entry.id,
              reason_fa: isStudioError(error) ? error.message_fa : 'خطای پیش‌بینی‌نشده در تولید این آیتم.',
            });
            if (!isStudioError(error)) throw error;
            context.failures.push({ code: error.code, message_fa: error.message_fa });
          }
        }
        const total = context.outcome.content_ids.length;
        context.outcome.summary_fa =
          total === 0
            ? context.outcome.summary_fa || 'آیتمی برای تولید پیش‌نویس نبود.'
            : `${faDigits(total)} پیش‌نویس ساخته شد: ${faDigits(ready)} آمادهٔ بازبینی و ${faDigits(needsRevision)} نیازمند اصلاح.`;
        return { summary_fa: context.outcome.summary_fa };
      },
    },
  ],
};
