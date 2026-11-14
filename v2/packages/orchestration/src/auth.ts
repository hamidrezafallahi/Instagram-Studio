import {
  API_VERSION,
  SCHEMA_VERSION,
  StudioError,
  type LoginBody,
  type Role,
  type SessionInfo,
  type SetupOwnerBody,
  type SetupStatus,
} from '@studio/contracts';
import { brandRepo, identityRepo } from '@studio/data';
import { roleAtLeast } from '@studio/policy';
import {
  dummyPasswordHash,
  generateToken,
  hashPassword,
  needsRehash,
  sha256Hex,
  verifyPassword,
} from '@studio/security';
import { audit, notFound, type Principal, type StudioDeps } from './context.ts';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface IssuedSession {
  /** نشانهٔ خام نشست؛ فقط یک‌بار در کوکی HttpOnly گذاشته می‌شود و در پایگاه داده فقط هش آن هست. */
  token: string;
  max_age_seconds: number;
  info: SessionInfo;
}

export interface AuthenticatedSession {
  principal: Principal;
  csrf_token: string;
  expires_at: string;
}

export interface Access {
  workspace_id: string;
  brand_id: string | undefined;
  role: Role;
}

export function createAuthService(deps: StudioDeps) {
  const ttlMs = deps.settings.sessionTtlHours * 3_600_000;

  async function issue(
    user: { id: string; email: string; display_name: string },
    userAgent: string | null,
  ): Promise<IssuedSession> {
    const token = generateToken(32);
    const csrf = generateToken(24);
    const expires = new Date(deps.now().getTime() + ttlMs);
    const workspaces = await deps.db.identity(async (tx) => {
      await identityRepo.insertSession(tx, {
        user_id: user.id,
        token_hash: sha256Hex(token),
        csrf_token: csrf,
        user_agent: userAgent,
        expires_at: expires,
      });
      return identityRepo.listMemberships(tx, user.id);
    });
    return {
      token,
      max_age_seconds: Math.floor(ttlMs / 1000),
      info: {
        user: { id: user.id, email: user.email, display_name: user.display_name },
        csrf_token: csrf,
        workspaces,
        expires_at: expires.toISOString(),
      },
    };
  }

  return {
    async setupStatus(): Promise<SetupStatus> {
      const users = await deps.db.identity((tx) => identityRepo.countUsers(tx));
      return {
        needs_owner_setup: users === 0,
        profile: deps.settings.profile,
        sample_data: deps.settings.sampleData,
        api_version: API_VERSION,
        schema_version: SCHEMA_VERSION,
      };
    },

    /** ساخت حساب مالک و فضای کاری؛ فقط وقتی هیچ کاربری وجود ندارد. */
    async setupOwner(body: SetupOwnerBody, meta: { trace_id: string; user_agent: string | null }): Promise<IssuedSession> {
      const passwordHash = await hashPassword(body.password);
      const created = await deps.db.identity(async (tx) => {
        // قفل تراکنشی: دو درخواست هم‌زمان نمی‌توانند دو مالک بسازند.
        await tx.query("SELECT pg_advisory_xact_lock(hashtext('studio_owner_setup'))");
        if ((await identityRepo.countUsers(tx)) > 0) throw new StudioError('SETUP_ALREADY_COMPLETED');
        const user = await identityRepo.insertUser(tx, {
          email: body.email,
          display_name: body.display_name,
          password_hash: passwordHash,
        });
        const workspace = await identityRepo.insertWorkspace(tx, body.workspace_name);
        await identityRepo.insertMembership(tx, workspace.id, user.id, 'owner');
        return { user, workspace };
      });
      await deps.db.tenant({ workspaceId: created.workspace.id }, (tx) =>
        audit(
          tx,
          {
            trace_id: meta.trace_id,
            workspace_id: created.workspace.id,
            actor: { type: 'user', id: created.user.id, role: 'owner' },
          },
          { action: 'owner.setup', target_type: 'workspace', target_id: created.workspace.id, outcome: 'succeeded' },
        ),
      );
      return issue(created.user, meta.user_agent);
    },

    async login(body: LoginBody, meta: { user_agent: string | null }): Promise<IssuedSession> {
      const user = await deps.db.identity((tx) => identityRepo.findUserByEmail(tx, body.email));
      const now = deps.now();
      if (user?.locked_until && user.locked_until > now) {
        // حتی هنگام قفل هم هش بررسی می‌شود تا زمان پاسخ وجود حساب را لو ندهد.
        await verifyPassword(body.password, await dummyPasswordHash());
        throw new StudioError('RATE_LIMITED', {
          message_fa: 'به دلیل تلاش‌های ناموفق، ورود این حساب موقتاً بسته است. چند دقیقهٔ دیگر دوباره تلاش کنید.',
        });
      }
      const ok = await verifyPassword(body.password, user?.password_hash ?? (await dummyPasswordHash()));
      if (!user || !ok || user.status !== 'active') {
        if (user) {
          const failures = user.failed_login_count + 1;
          const lock = failures >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
          await deps.db.identity((tx) => identityRepo.recordLoginFailure(tx, user.id, lock));
        }
        throw new StudioError('UNAUTHENTICATED', { message_fa: 'ایمیل یا رمز نادرست است.' });
      }
      const rehash = needsRehash(user.password_hash) ? await hashPassword(body.password) : null;
      await deps.db.identity((tx) => identityRepo.recordLoginSuccess(tx, user.id, rehash));
      return issue(user, meta.user_agent);
    },

    /** نشست معتبر را از نشانهٔ کوکی پیدا می‌کند؛ نشانهٔ ناشناخته، منقضی یا باطل‌شده null است. */
    async authenticate(token: string | undefined): Promise<AuthenticatedSession | null> {
      if (!token || token.length < 20 || token.length > 200) return null;
      const session = await deps.db.identity(async (tx) => {
        const row = await identityRepo.findActiveSession(tx, sha256Hex(token));
        if (row) await identityRepo.touchSession(tx, row.id);
        return row;
      });
      if (!session) return null;
      return {
        principal: {
          user_id: session.user_id,
          email: session.email,
          display_name: session.display_name,
          session_id: session.id,
        },
        csrf_token: session.csrf_token,
        expires_at: session.expires_at.toISOString(),
      };
    },

    async sessionInfo(session: AuthenticatedSession): Promise<SessionInfo> {
      const workspaces = await deps.db.identity((tx) =>
        identityRepo.listMemberships(tx, session.principal.user_id),
      );
      return {
        user: {
          id: session.principal.user_id,
          email: session.principal.email,
          display_name: session.principal.display_name,
        },
        csrf_token: session.csrf_token,
        workspaces,
        expires_at: session.expires_at,
      };
    },

    async logout(session: AuthenticatedSession): Promise<void> {
      await deps.db.identity((tx) => identityRepo.revokeSession(tx, session.principal.session_id));
    },

    /**
     * بررسی عضویت و scope در سرور. غیرعضو پاسخ «پیدا نشد» می‌گیرد تا وجود فضای کاری یا برند
     * دیگران قابل کشف نباشد. مالک به همهٔ برندهای فضای کاری دسترسی دارد؛ بقیه فقط با brand_membership.
     */
    async authorize(
      principal: Principal,
      workspaceId: string,
      brandId: string | undefined,
      minimum: Role,
    ): Promise<Access> {
      const workspaceRole = await deps.db.identity((tx) =>
        identityRepo.findMembership(tx, workspaceId, principal.user_id),
      );
      if (!workspaceRole) throw notFound('فضای کاری');
      let role = workspaceRole;
      if (brandId !== undefined) {
        role = await deps.db.tenant({ workspaceId, brandId }, async (tx) => {
          const brand = await brandRepo.getBrand(tx, brandId);
          if (!brand) throw notFound('برند');
          if (workspaceRole === 'owner') return workspaceRole;
          const scoped = await brandRepo.findBrandMembership(tx, brandId, principal.user_id);
          if (!scoped) throw notFound('برند');
          return scoped;
        });
      }
      if (!roleAtLeast(role, minimum)) throw new StudioError('FORBIDDEN');
      return { workspace_id: workspaceId, brand_id: brandId, role };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
