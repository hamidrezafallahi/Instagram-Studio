import type { Role } from '@studio/contracts';
import type { Tx } from '../db.ts';

/** جدول‌های هویت: بدون دادهٔ کسب‌وکار و بدون RLS؛ فقط از سرویس احراز هویت خوانده می‌شوند. */

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: 'active' | 'disabled';
  failed_login_count: number;
  locked_until: Date | null;
}

const USER_COLUMNS = 'id, email, display_name, password_hash, status, failed_login_count, locked_until';

export async function countUsers(tx: Tx): Promise<number> {
  const result = await tx.query<{ count: number }>('SELECT count(*)::int AS count FROM users');
  return result.rows[0]?.count ?? 0;
}

export async function insertUser(
  tx: Tx,
  input: { email: string; display_name: string; password_hash: string },
): Promise<UserRow> {
  const result = await tx.query<UserRow>(
    `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
    [input.email.trim().toLowerCase(), input.display_name.trim(), input.password_hash],
  );
  return result.rows[0] as UserRow;
}

export async function findUserByEmail(tx: Tx, email: string): Promise<UserRow | null> {
  const result = await tx.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = $1`,
    [email.trim().toLowerCase()],
  );
  return result.rows[0] ?? null;
}

export async function recordLoginFailure(tx: Tx, userId: string, lockedUntil: Date | null): Promise<void> {
  await tx.query(
    `UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = $2, updated_at = now() WHERE id = $1`,
    [userId, lockedUntil],
  );
}

export async function recordLoginSuccess(tx: Tx, userId: string, newHash: string | null): Promise<void> {
  await tx.query(
    `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now(), updated_at = now(),
            password_hash = coalesce($2, password_hash) WHERE id = $1`,
    [userId, newHash],
  );
}

export async function insertWorkspace(tx: Tx, name: string): Promise<{ id: string; name: string }> {
  const result = await tx.query<{ id: string; name: string }>(
    'INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name',
    [name.trim()],
  );
  return result.rows[0] as { id: string; name: string };
}

export async function getWorkspace(tx: Tx, id: string): Promise<{ id: string; name: string } | null> {
  const result = await tx.query<{ id: string; name: string }>('SELECT id, name FROM workspaces WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function insertMembership(tx: Tx, workspaceId: string, userId: string, role: Role): Promise<void> {
  await tx.query('INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)', [
    workspaceId,
    userId,
    role,
  ]);
}

export async function listMemberships(
  tx: Tx,
  userId: string,
): Promise<{ id: string; name: string; role: Role }[]> {
  const result = await tx.query<{ id: string; name: string; role: Role }>(
    `SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 ORDER BY w.created_at`,
    [userId],
  );
  return result.rows;
}

export async function findMembership(tx: Tx, workspaceId: string, userId: string): Promise<Role | null> {
  const result = await tx.query<{ role: Role }>(
    'SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  csrf_token: string;
  expires_at: Date;
  email: string;
  display_name: string;
  user_status: 'active' | 'disabled';
}

export async function insertSession(
  tx: Tx,
  input: { user_id: string; token_hash: string; csrf_token: string; user_agent: string | null; expires_at: Date },
): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.user_id, input.token_hash, input.csrf_token, input.user_agent?.slice(0, 300) ?? null, input.expires_at],
  );
  return (result.rows[0] as { id: string }).id;
}

/** نشست معتبر: باطل‌نشده، منقضی‌نشده و متعلق به کاربر فعال. */
export async function findActiveSession(tx: Tx, tokenHash: string): Promise<SessionRow | null> {
  const result = await tx.query<SessionRow>(
    `SELECT s.id, s.user_id, s.csrf_token, s.expires_at, u.email, u.display_name, u.status AS user_status
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function touchSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]);
}

export async function revokeSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

export async function deleteExpiredSessions(tx: Tx): Promise<number> {
  const result = await tx.query("DELETE FROM sessions WHERE expires_at < now() - interval '7 days'");
  return result.rowCount ?? 0;
}
