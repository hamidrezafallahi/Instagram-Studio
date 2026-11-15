import type { GenerateRequest } from '@studio/ai';
import type { AgentRole } from './types.ts';

export type { AgentRole } from './types.ts';
export { PlanProposal, strategist, type StrategistInput } from './strategist.ts';
export { DraftOutput, copywriter, type CopywriterInput } from './copywriter.ts';
export { QA_VERSION, QaOutput, editorQa, type EditorQaInput } from './editor-qa.ts';

/** درخواست درگاه مدل برای یک نقش؛ همان مسیر برای تولید قالبی و مدل زبانی. */
export function toRequest<I, O>(agent: AgentRole<I, O>, input: I): GenerateRequest<I, O> {
  return {
    role: agent.role,
    prompt_version: agent.prompt_version,
    input,
    output_schema: agent.output_schema,
    template: (value) => agent.template(value),
  };
}
