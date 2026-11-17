import type { RunIntent } from '@studio/contracts';
import { draftProductionWorkflow } from './editorial/draft-production.ts';
import { visualRenderWorkflow } from './editorial/visual-render.ts';
import { weeklyPlanWorkflow } from './editorial/weekly-plan.ts';
import { metricsCollectionWorkflow } from './reporting/metrics-collection.ts';
import type { WorkflowDefinition } from './types.ts';

export type {
  DraftToSave,
  LoadedBrand,
  MetricsSource,
  RenderCandidate,
  RenderOutcome,
  RunContext,
  RunOutcome,
  RunParams,
  StepDefinition,
  StepResult,
  WorkflowDefinition,
  WorkflowTools,
} from './types.ts';
export { draftProductionWorkflow, metricsCollectionWorkflow, visualRenderWorkflow, weeklyPlanWorkflow };

/** هر intent دقیقاً یک تعریف گردش‌کار نسخه‌دار دارد. */
export const WORKFLOWS: Readonly<Record<RunIntent, WorkflowDefinition>> = {
  build_weekly_plan: weeklyPlanWorkflow,
  generate_drafts: draftProductionWorkflow,
  render_visuals: visualRenderWorkflow,
  collect_metrics: metricsCollectionWorkflow,
};
