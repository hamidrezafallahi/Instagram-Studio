import { isStudioError } from '@studio/contracts';
import { addDays, faDate, faDigits, localToUtc } from '@studio/domain';
import type { RunContext, WorkflowDefinition } from '../types.ts';

/**
 * بخش «تازه‌سازی سنجه» از W08 — بازبینی هفتگی.
 * فقط از اتصال‌هایی می‌خواند که قابلیت metrics_read آزموده دارند؛ شکست یک اتصال بقیه را متوقف نمی‌کند.
 */
export const metricsCollectionWorkflow: WorkflowDefinition = {
  id: 'metrics_collection',
  version: '1.0.0',
  intent: 'collect_metrics',
  title_fa: 'جمع‌آوری سنجه',
  describeScope: ({ brand_name, week_start }) =>
    `خواندن سنجه‌های هفتهٔ ${faDate(week_start)} برند «${brand_name}» از اتصال‌های دارای قابلیت خواندن سنجه. فقط خواندن؛ هزینه: صفر.`,
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
      name: 'select_sources',
      title_fa: 'انتخاب اتصال‌های دارای سنجه',
      timeout_ms: 10_000,
      async run(context, tools) {
        context.sources = await tools.listMetricsSources();
        if (context.sources.length === 0) {
          context.outcome.summary_fa =
            'هیچ اتصالی با قابلیت آزمودهٔ خواندن سنجه وجود ندارد؛ سنجه‌ها در گزارش «در دسترس نیست» می‌مانند.';
        }
        return { summary_fa: context.outcome.summary_fa || `${faDigits(context.sources.length)} اتصال انتخاب شد.` };
      },
    },
    {
      name: 'fetch_and_store',
      title_fa: 'خواندن و ذخیرهٔ سنجه',
      timeout_ms: 60_000,
      async run(context, tools) {
        const brand = context.brand as NonNullable<RunContext['brand']>;
        const period = {
          start: localToUtc(context.week_start, '00:00', brand.profile.timezone),
          end: localToUtc(addDays(context.week_start, 7), '00:00', brand.profile.timezone),
        };
        let stored = 0;
        let sample = false;
        for (const source of context.sources ?? []) {
          try {
            const batch = await tools.fetchMetrics(source, period);
            stored += await tools.saveMetrics(source, batch);
            context.produced += 1;
            sample ||= batch.is_sample;
          } catch (error) {
            if (!isStudioError(error)) throw error;
            context.failures.push({ code: error.code, message_fa: error.message_fa });
            context.outcome.skipped.push({ ref: source.connection_id, reason_fa: `«${source.label}»: ${error.message_fa}` });
          }
        }
        if ((context.sources ?? []).length > 0) {
          context.outcome.summary_fa = `${faDigits(stored)} مقدار سنجه ذخیره شد${sample ? ' (دادهٔ نمونه)' : ''}.`;
        }
        return { summary_fa: context.outcome.summary_fa };
      },
    },
  ],
};
