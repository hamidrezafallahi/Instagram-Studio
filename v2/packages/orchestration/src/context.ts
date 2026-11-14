import type { ModelGateway } from '@studio/ai';
import type { ConnectorRegistry } from '@studio/connectors';
import {
  StudioError,
  type ActorType,
  type CapabilityRegister,
  type IndustryPack,
  type Role,
} from '@studio/contracts';
import { recordRepo, type AuditInput, type Database, type Tx } from '@studio/data';
import type { Logger, Vault } from '@studio/security';

/** وابستگی‌های مشترک همهٔ سرویس‌ها؛ در composition root هر برنامه (API، worker، MCP) ساخته می‌شود. */
export interface StudioDeps {
  db: Database;
  vault: Vault;
  packs: ReadonlyMap<string, IndustryPack>;
  register: CapabilityRegister;
  connectors: ConnectorRegistry;
  models: ModelGateway;
  logger: Logger;
  settings: {
    profile: 'local' | 'server';
    /** اجازهٔ ساخت برند و اتصال نمونه و نمایش بنر «دادهٔ نمونه». */
    sampleData: boolean;
    sessionTtlHours: number;
  };
  now: () => Date;
}

export interface Principal {
  user_id: string;
  email: string;
  display_name: string;
  session_id: string;
}

export interface Actor {
  type: ActorType;
  id: string;
  role: Role;
}

/**
 * زمینهٔ یک فراخوان سرویس پس از احراز هویت و بررسی عضویت در سرور.
 * داشبورد، MCP و پیام‌رسان مالک همه همین زمینه را می‌سازند و از همان سرویس‌ها عبور می‌کنند.
 */
export interface WorkspaceCall {
  trace_id: string;
  actor: Actor;
  workspace_id: string;
}

export interface BrandCall extends WorkspaceCall {
  brand_id: string;
}

export function packOf(deps: StudioDeps, packId: string): IndustryPack {
  const pack = deps.packs.get(packId);
  if (!pack) {
    throw new StudioError('VALIDATION_FAILED', {
      message_fa: `بستهٔ صنعت «${packId}» وجود ندارد.`,
      details: [{ path: 'industry_pack_id', message: 'بستهٔ صنعت ناشناخته است.' }],
    });
  }
  return pack;
}

/** ثبت رد حسابرسی در همان تراکنشِ تغییر؛ اگر تغییر rollback شود رد آن هم نمی‌ماند. */
export async function audit(
  tx: Tx,
  call: WorkspaceCall & { brand_id?: string },
  event: Pick<AuditInput, 'action' | 'target_type' | 'target_id' | 'outcome'> & {
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordRepo.insertAudit(tx, {
    workspace_id: call.workspace_id,
    brand_id: call.brand_id ?? null,
    actor_type: call.actor.type,
    actor_id: call.actor.id,
    trace_id: call.trace_id,
    ...event,
  });
}

export const notFound = (what: string): StudioError =>
  new StudioError('NOT_FOUND', { message_fa: `${what} پیدا نشد.` });
