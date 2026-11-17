import { StudioError, type QaCheck, type QaResult } from '@studio/contracts';
import { assetRepo, contentRepo, planRepo, type Tx } from '@studio/data';
import {
  CONTENT_EDITABLE_STATES,
  assertTransition,
  contentMachine,
  faDigits,
  hashContentRevision,
} from '@studio/domain';
import {
  HtmlRenderer,
  TEMPLATE_VERSION,
  VISUAL_QA_VERSION,
  isVisualFormat,
  renderVisual,
  type StoredFile,
} from '@studio/media';
import type { RenderCandidate, RenderOutcome } from '@studio/workflows';
import type { BrandService } from './brands.ts';
import { audit, notFound, type BrandCall, type StudioDeps } from './context.ts';
import type { PlanningHooks } from './planning.ts';

const RENDER_LICENSE = 'رندر قالب استودیو از متن همین محتوا؛ فونت Vazirmatn (SIL OFL 1.1)';

/** وضعیت QA پس از ادغام چک‌های متنی قبلی با چک‌های بصری تازه. */
export function mergeQa(previous: QaResult, visual: QaCheck[], checkedAt: string): QaResult {
  const checks = [...previous.checks.filter((item) => !item.id.startsWith('visual_')), ...visual];
  const failedError = checks.some((item) => !item.passed && item.severity === 'error');
  const failedWarning = checks.some((item) => !item.passed && item.severity === 'warning');
  const baseVersion = previous.qa_version.split('+')[0] ?? previous.qa_version;
  return {
    status: failedError ? 'fail' : failedWarning ? 'pass_with_warnings' : 'pass',
    qa_version: `${baseVersion}+${VISUAL_QA_VERSION}`,
    checked_at: checkedAt,
    checks,
  };
}

export function createVisualService(deps: StudioDeps, brands: BrandService, hooks: PlanningHooks = {}) {
  const scopeOf = (call: BrandCall) => ({ workspaceId: call.workspace_id, brandId: call.brand_id });

  /** دلیل نامناسب‌بودن یک محتوا برای رندر، یا null. */
  async function unsuitable(tx: Tx, contentId: string): Promise<string | null> {
    const item = await contentRepo.getContentItem(tx, contentId);
    if (!item) return 'این محتوا پیدا نشد.';
    if (!isVisualFormat(item.format)) return 'این قالب محتوا تصویر ندارد (فقط کاروسل، پست، استوری و ریلز).';
    if (!CONTENT_EDITABLE_STATES.includes(item.state)) return 'این محتوا در وضعیت فعلی قابل تغییر نیست.';
    if (item.current_revision === 0) return 'این محتوا هنوز متن ندارد.';
    return null;
  }

  return {
    async listRenderable(
      call: BrandCall,
      weekStart: string,
      contentIds?: string[],
    ): Promise<{ candidates: RenderCandidate[]; skipped: { ref: string; reason_fa: string }[] }> {
      return deps.db.tenant(scopeOf(call), async (tx) => {
        const candidates: RenderCandidate[] = [];
        const skipped: { ref: string; reason_fa: string }[] = [];
        let ids: string[];
        if (contentIds?.length) {
          ids = contentIds;
        } else {
          const plan = await planRepo.getCurrentPlan(tx, call.brand_id, weekStart);
          ids = (plan?.entries ?? []).flatMap((entry) => (entry.content_id ? [entry.content_id] : []));
        }
        for (const id of ids) {
          const reason = await unsuitable(tx, id);
          const item = reason ? null : await contentRepo.getContentItem(tx, id);
          if (!item) {
            // در حالت خودکار محتوای غیرتصویری بی‌صدا کنار می‌رود؛ انتخاب صریح دلیل می‌گیرد.
            if (contentIds?.length) skipped.push({ ref: id, reason_fa: reason ?? 'این محتوا پیدا نشد.' });
            continue;
          }
          if (!contentIds?.length) {
            const [current] = await contentRepo.listRevisions(tx, id);
            if ((current?.asset_ids.length ?? 0) > 0) {
              skipped.push({ ref: id, reason_fa: 'این محتوا قبلاً تصویر دارد؛ برای ساخت دوباره آن را انتخاب کنید.' });
              continue;
            }
          }
          candidates.push({ content_id: id, title_fa: item.title_fa, format: item.format });
        }
        return { candidates, skipped };
      });
    },

    /**
     * رندر نسخهٔ جاری یک محتوا. هیچ تراکنشی هنگام رندر باز نمی‌ماند؛ اگر محتوا در این فاصله تغییر کرده باشد
     * نتیجه دور ریخته می‌شود (STALE_REVISION) تا تصویر قدیمی روی متن تازه ننشیند.
     */
    async renderContent(call: BrandCall, contentId: string, createdBy: string): Promise<RenderOutcome> {
      const snapshot = await deps.db.tenant(scopeOf(call), async (tx) => {
        const reason = await unsuitable(tx, contentId);
        if (reason) throw new StudioError('INVALID_TRANSITION', { message_fa: reason });
        const item = await contentRepo.getContentItem(tx, contentId);
        const [current] = await contentRepo.listRevisions(tx, contentId);
        if (!item || !current) throw notFound('محتوا');
        const brand = await brands.load(tx, call.brand_id);
        return { item, current, profile: brand.profile, is_sample: brand.row.is_sample };
      });
      const format = snapshot.item.format;
      if (!isVisualFormat(format)) throw new StudioError('INVALID_TRANSITION');

      if (!deps.render.browserPath) {
        throw new StudioError('UNSUPPORTED_CAPABILITY', {
          message_fa: 'مرورگر Chrome یا Edge روی این دستگاه پیدا نشد؛ ساخت تصویر ممکن نیست.',
          action_required: 'Chrome یا Edge را نصب کنید یا مسیرش را در STUDIO_BROWSER_PATH بگذارید.',
        });
      }
      let renderer: HtmlRenderer;
      try {
        renderer = await HtmlRenderer.launch(deps.render.browserPath);
      } catch (error) {
        deps.logger.error({ err: error, trace_id: call.trace_id }, 'renderer launch failed');
        throw new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'مرورگر رندر اجرا نشد.' });
      }
      let result;
      try {
        result = await renderVisual(renderer, {
          format,
          text: snapshot.current.text,
          pillar: snapshot.item.pillar,
          visual: snapshot.profile.visual,
          fontBase64: deps.render.fontBase64(),
        });
      } catch (error) {
        deps.logger.error({ err: error, trace_id: call.trace_id, content_id: contentId }, 'render failed');
        throw new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'رندر تصویر این محتوا شکست خورد.' });
      } finally {
        await renderer.close();
      }
      if (result.slides.length === 0) {
        return {
          content_id: contentId,
          slides: 0,
          qa_status: 'fail',
          skipped_reason_fa: 'در متن اسلاید یا تیتری برای تصویر پیدا نشد؛ ساختار «اسلاید ۱ (کاور): …» لازم است.',
        };
      }

      const stored: StoredFile[] = [];
      for (const slide of result.slides) stored.push(await deps.assets.put(call.workspace_id, call.brand_id, slide.png));

      return deps.db.tenant(scopeOf(call), async (tx) => {
        const item = await contentRepo.getContentItem(tx, contentId);
        if (!item || item.version !== snapshot.item.version || item.current_revision !== snapshot.current.revision) {
          throw new StudioError('STALE_REVISION', { message_fa: 'محتوا هنگام ساخت تصویر تغییر کرد؛ دوباره اجرا کنید.' });
        }
        const assetIds: string[] = [];
        for (const [index, slide] of result.slides.entries()) {
          const file = stored[index] as StoredFile;
          const { record } = await assetRepo.insertAsset(tx, {
            workspace_id: call.workspace_id,
            brand_id: call.brand_id,
            kind: 'image',
            provenance: 'rendered',
            mime: 'image/png',
            byte_size: file.byte_size,
            checksum: file.checksum,
            width: slide.width,
            height: slide.height,
            duration_ms: null,
            language: 'fa',
            filename: `${format}-${String(index + 1).padStart(2, '0')}.png`,
            title_fa: `${item.title_fa.slice(0, 150)} — تصویر ${faDigits(index + 1)}`,
            license: RENDER_LICENSE,
            consent: 'not_applicable',
            storage_key: file.storage_key,
            parent_asset_id: null,
            version: 1,
            metadata: {
              template_version: TEMPLATE_VERSION,
              content_id: contentId,
              source_revision: snapshot.current.revision,
              slide_index: index,
              role: slide.slide.role,
              scale: slide.scale,
            },
            is_sample: snapshot.is_sample,
            created_by: createdBy,
          });
          assetIds.push(record.view.id);
        }
        if (JSON.stringify(assetIds) === JSON.stringify(snapshot.current.asset_ids)) {
          return { content_id: contentId, slides: assetIds.length, qa_status: item.qa_status, skipped_reason_fa: 'تصویرها تغییری نکردند.' };
        }

        const qa = mergeQa(snapshot.current.qa_result, result.checks, deps.now().toISOString());
        const finalState = qa.status === 'fail' ? 'needs_revision' : 'ready_for_review';
        assertTransition(contentMachine, item.state, 'validating');
        assertTransition(contentMachine, 'validating', finalState);
        const revision = item.current_revision + 1;
        const { text, source_refs: sourceRefs, claims } = snapshot.current;
        await contentRepo.insertRevision(tx, {
          workspace_id: call.workspace_id,
          brand_id: call.brand_id,
          content_id: contentId,
          revision,
          text,
          asset_ids: assetIds,
          source_refs: sourceRefs,
          claims,
          qa_result: qa,
          hash: hashContentRevision({ text, asset_ids: assetIds, source_refs: sourceRefs, claims }),
          generator: { kind: 'template', provider: 'local-renderer', role: 'designer', prompt_version: TEMPLATE_VERSION },
          note: 'ساخت تصویر با قالب برند',
          created_by: createdBy,
        });
        const updated = await contentRepo.updateContentState(tx, contentId, item.version, {
          state: finalState,
          current_revision: revision,
          qa_status: qa.status,
        });
        if (!updated) throw new StudioError('STALE_REVISION');
        const invalidated = (await hooks.onRevision?.(tx, call, contentId)) ?? 0;
        await audit(tx, call, {
          action: 'content.visual.render',
          target_type: 'content',
          target_id: contentId,
          outcome: 'succeeded',
          metadata: { revision, slides: assetIds.length, qa_status: qa.status, template: TEMPLATE_VERSION, invalidated_intents: invalidated },
        });
        return { content_id: contentId, slides: assetIds.length, qa_status: qa.status, skipped_reason_fa: null };
      });
    },
  };
}

export type VisualService = ReturnType<typeof createVisualService>;
