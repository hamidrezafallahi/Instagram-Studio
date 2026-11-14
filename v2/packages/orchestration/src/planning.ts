import { editorQa, toRequest } from '@studio/agents';
import {
  StudioError,
  type ContentItemDetail,
  type ContentItemSummary,
  type ContentState,
  type CreateContentRevisionBody,
  type Plan,
  type ScheduleEntry,
  type UpdateScheduleEntryBody,
} from '@studio/contracts';
import { contentRepo, planRepo, type Tx } from '@studio/data';
import {
  CONTENT_EDITABLE_STATES,
  assertTransition,
  contentMachine,
  faDate,
  hashContentRevision,
  localToUtc,
  normalizePersian,
  todayIn,
  weekStartOf,
  weekdayOf,
} from '@studio/domain';
import type { BrandService } from './brands.ts';
import { audit, notFound, type BrandCall, type StudioDeps } from './context.ts';

export function createPlanningService(deps: StudioDeps, brands: BrandService) {
  async function contentDetail(tx: Tx, contentId: string): Promise<ContentItemDetail> {
    const item = await contentRepo.getContentItem(tx, contentId);
    const brief = item ? await contentRepo.getBrief(tx, contentId) : null;
    if (!item || !brief) throw notFound('محتوا');
    return { item, brief, revisions: await contentRepo.listRevisions(tx, contentId) };
  }

  return {
    /** شروع هفتهٔ برند برای یک تاریخ دلخواه (یا امروز به وقت برند). */
    async weekStartFor(call: BrandCall, weekOf: string | undefined): Promise<string> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const { profile } = await brands.load(tx, call.brand_id);
        return weekStartOf(weekOf ?? todayIn(profile.timezone, deps.now()), profile.week_start);
      });
    },

    async listPlans(call: BrandCall, weekOf: string | undefined): Promise<Plan[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        if (weekOf === undefined) return planRepo.listPlans(tx, call.brand_id);
        const { profile } = await brands.load(tx, call.brand_id);
        return planRepo.listPlans(tx, call.brand_id, weekStartOf(weekOf, profile.week_start));
      });
    },

    /**
     * ویرایش آیتم تقویم با بررسی optimistic نسخه. زمان همیشه از تاریخ و ساعت محلی برند به UTC تبدیل می‌شود.
     * آیتم باید درون همان هفتهٔ برنامه بماند؛ جابه‌جایی بین هفته‌ها با ساخت برنامهٔ همان هفته انجام می‌شود.
     */
    async updateEntry(call: BrandCall, entryId: string, body: UpdateScheduleEntryBody): Promise<ScheduleEntry> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const context = await planRepo.getEntryContext(tx, entryId);
        if (!context) throw notFound('آیتم تقویم');
        const { entry } = context;
        if (context.plan_status === 'superseded') {
          throw new StudioError('CONFLICT', { message_fa: 'این آیتم به برنامه‌ای تعلق دارد که جایگزین شده است.' });
        }
        if (entry.version !== body.expected_version) throw new StudioError('STALE_REVISION');
        if (body.status !== undefined && entry.content_id !== null && body.status !== 'planned') {
          throw new StudioError('CONFLICT', {
            message_fa: 'این آیتم پیش‌نویس دارد؛ برای کنارگذاشتن آن ابتدا تکلیف محتوا را روشن کنید.',
          });
        }
        const localDate = body.local_date ?? entry.local_date;
        const localTime = body.local_time ?? entry.local_time;
        if (localDate < context.week_start || localDate > context.week_end) {
          throw new StudioError('VALIDATION_FAILED', {
            message_fa: 'تاریخ باید درون همان هفتهٔ برنامه باشد.',
            details: [{ path: 'local_date', message: `بازهٔ مجاز: ${faDate(context.week_start)} تا ${faDate(context.week_end)}` }],
          });
        }
        const scheduledAt = localToUtc(localDate, localTime, context.timezone);
        const updated = await planRepo.updateEntry(tx, entryId, body.expected_version, {
          topic_fa: body.topic_fa?.trim() ?? entry.topic_fa,
          weekday: weekdayOf(localDate),
          local_date: localDate,
          local_time: localTime,
          scheduled_at_utc: scheduledAt,
          status: body.status ?? (entry.status === 'drafted' ? 'drafted' : entry.status),
        });
        if (!updated) throw new StudioError('STALE_REVISION');
        if (entry.content_id && scheduledAt !== entry.scheduled_at_utc) {
          // محتوا زمان آیتم را دنبال می‌کند. از M2 این تغییر تأیید همان نسخه را هم باطل می‌کند.
          await tx.query('UPDATE content_items SET scheduled_at_utc = $2 WHERE id = $1', [
            entry.content_id,
            scheduledAt,
          ]);
        }
        await audit(tx, call, {
          action: 'schedule_entry.update',
          target_type: 'schedule_entry',
          target_id: entryId,
          outcome: 'succeeded',
          metadata: {
            version: updated.version,
            time_changed: scheduledAt !== entry.scheduled_at_utc,
            topic_changed: updated.topic_fa !== entry.topic_fa,
            status: updated.status,
          },
        });
        return updated;
      });
    },

    async listContent(call: BrandCall, state: ContentState | undefined): Promise<ContentItemSummary[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        contentRepo.listContentItems(tx, call.brand_id, state),
      );
    },

    async getContent(call: BrandCall, contentId: string): Promise<ContentItemDetail> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        contentDetail(tx, contentId),
      );
    },

    /**
     * ویرایش انسانی: نسخهٔ immutable تازه با هش تازه، QA دوباره و بازگشت به بازبینی.
     * نسخهٔ قبلی دست‌نخورده می‌ماند و تأییدی که به هش آن بسته بوده دیگر با محتوای جاری نمی‌خواند.
     */
    async createRevision(
      call: BrandCall,
      contentId: string,
      body: CreateContentRevisionBody,
    ): Promise<ContentItemDetail> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const current = await contentDetail(tx, contentId);
        const { item, brief } = current;
        if (!CONTENT_EDITABLE_STATES.includes(item.state)) {
          throw new StudioError('INVALID_TRANSITION', {
            message_fa: 'این محتوا در وضعیت فعلی قابل ویرایش نیست.',
          });
        }
        if (item.current_revision !== body.expected_revision) throw new StudioError('STALE_REVISION');
        const text = normalizePersian(body.text).trim();
        const previous = current.revisions[0];
        if (previous && previous.text === text) {
          throw new StudioError('CONFLICT', { message_fa: 'متن تغییری نکرده است.' });
        }

        const brand = await brands.load(tx, call.brand_id);
        const qa = await deps.models.session().generate(
          toRequest(editorQa, {
            text,
            format: item.format,
            cta_fa: brief.cta,
            profile: brand.profile,
            pack: brand.pack,
            is_sample: brand.row.is_sample,
            checked_at: deps.now().toISOString(),
          }),
        );
        const finalState: ContentState = qa.output.qa_result.status === 'fail' ? 'needs_revision' : 'ready_for_review';
        assertTransition(contentMachine, item.state, 'validating');
        assertTransition(contentMachine, 'validating', finalState);

        const revision = item.current_revision + 1;
        const sourceRefs = previous?.source_refs ?? [];
        await contentRepo.insertRevision(tx, {
          workspace_id: call.workspace_id,
          brand_id: call.brand_id,
          content_id: contentId,
          revision,
          text,
          source_refs: sourceRefs,
          claims: qa.output.claims,
          qa_result: qa.output.qa_result,
          hash: hashContentRevision({ text, asset_ids: [], source_refs: sourceRefs, claims: qa.output.claims }),
          generator: { kind: 'human', provider: 'dashboard', role: null, prompt_version: null },
          note: body.note?.trim() || null,
          created_by: call.actor.id,
        });
        const updated = await contentRepo.updateContentState(tx, contentId, item.version, {
          state: finalState,
          current_revision: revision,
          qa_status: qa.output.qa_result.status,
        });
        if (!updated) throw new StudioError('STALE_REVISION');
        await audit(tx, call, {
          action: 'content.revision.create',
          target_type: 'content',
          target_id: contentId,
          outcome: 'succeeded',
          metadata: { revision, state: finalState, qa_status: qa.output.qa_result.status },
        });
        return contentDetail(tx, contentId);
      });
    },
  };
}

export type PlanningService = ReturnType<typeof createPlanningService>;
