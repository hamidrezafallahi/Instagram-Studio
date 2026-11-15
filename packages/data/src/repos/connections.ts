import type {
  AuthKind,
  Capability,
  ConnectionHealth,
  ConnectionStatus,
  DiscoveredCapability,
} from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

export interface ConnectionRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  provider: string;
  label: string;
  status: ConnectionStatus;
  is_sample: boolean;
  auth_kind: AuthKind;
  external_account_id: string | null;
  secret_ref: string | null;
  config: Record<string, unknown>;
  health: ConnectionHealth | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS =
  'id, workspace_id, brand_id, provider, label, status, is_sample, auth_kind, external_account_id, secret_ref, config, health, created_at, updated_at';

export async function insertConnection(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    provider: string;
    label: string;
    status: ConnectionStatus;
    is_sample: boolean;
    auth_kind: AuthKind;
    secret_ref: string | null;
    config: Record<string, unknown>;
  },
): Promise<ConnectionRow> {
  const result = await tx.query<ConnectionRow>(
    `INSERT INTO connections (workspace_id, brand_id, provider, label, status, is_sample, auth_kind, secret_ref, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.provider, input.label, input.status, input.is_sample,
      input.auth_kind, input.secret_ref, JSON.stringify(input.config),
    ],
  );
  return result.rows[0] as ConnectionRow;
}

export async function listConnections(tx: Tx, brandId: string): Promise<ConnectionRow[]> {
  const result = await tx.query<ConnectionRow>(
    `SELECT ${COLUMNS} FROM connections WHERE brand_id = $1 ORDER BY (status = 'revoked'), created_at`,
    [brandId],
  );
  return result.rows;
}

export async function getConnection(tx: Tx, connectionId: string): Promise<ConnectionRow | null> {
  const result = await tx.query<ConnectionRow>(`SELECT ${COLUMNS} FROM connections WHERE id = $1`, [connectionId]);
  return result.rows[0] ?? null;
}

export async function updateConnectionState(
  tx: Tx,
  connectionId: string,
  patch: { status: ConnectionStatus; health: ConnectionHealth | null; secret_ref?: string | null },
): Promise<ConnectionRow | null> {
  const result = await tx.query<ConnectionRow>(
    `UPDATE connections SET status = $2, health = $3,
            secret_ref = CASE WHEN $4::boolean THEN $5 ELSE secret_ref END,
            revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE revoked_at END
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [
      connectionId, patch.status, patch.health ? JSON.stringify(patch.health) : null,
      patch.secret_ref !== undefined, patch.secret_ref ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

interface CapabilityRow {
  connection_id: string;
  action: string;
  status: Capability['status'];
  reason_code: string;
  limits: Record<string, unknown>;
  scopes: string[];
  evidence_url: string | null;
  verified_at: Date | null;
  expires_at: Date | null;
}

const toCapability = (row: CapabilityRow): Capability => ({
  connection_id: row.connection_id,
  action: row.action,
  status: row.status,
  reason_code: row.reason_code,
  limits: row.limits,
  scopes: row.scopes,
  evidence_url: row.evidence_url,
  verified_at: iso(row.verified_at),
  expires_at: iso(row.expires_at),
});

/** نتیجهٔ کشف تازه جایگزین قابلیت‌های قبلی همان اتصال می‌شود. */
export async function replaceCapabilities(
  tx: Tx,
  connection: Pick<ConnectionRow, 'id' | 'workspace_id' | 'brand_id'>,
  capabilities: readonly DiscoveredCapability[],
): Promise<void> {
  await tx.query('DELETE FROM capabilities WHERE connection_id = $1', [connection.id]);
  for (const capability of capabilities) {
    await tx.query(
      `INSERT INTO capabilities (workspace_id, brand_id, connection_id, action, status, reason_code, limits,
                                 scopes, evidence_url, verified_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        connection.workspace_id, connection.brand_id, connection.id, capability.action, capability.status,
        capability.reason_code, JSON.stringify(capability.limits), JSON.stringify(capability.scopes),
        capability.evidence_url, capability.verified_at, capability.expires_at,
      ],
    );
  }
}

export async function listCapabilities(tx: Tx, brandId: string): Promise<Capability[]> {
  const result = await tx.query<CapabilityRow>(
    `SELECT connection_id, action, status, reason_code, limits, scopes, evidence_url, verified_at, expires_at
       FROM capabilities WHERE brand_id = $1 ORDER BY connection_id, action`,
    [brandId],
  );
  return result.rows.map(toCapability);
}

export async function insertSecret(
  tx: Tx,
  input: {
    id: string;
    workspace_id: string;
    brand_id: string;
    purpose: string;
    ciphertext: Buffer;
    wrapped_key: Buffer;
    key_version: number;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO secret_vault (id, workspace_id, brand_id, purpose, ciphertext, wrapped_key, key_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.id, input.workspace_id, input.brand_id, input.purpose, input.ciphertext, input.wrapped_key,
      input.key_version,
    ],
  );
}

export async function getSecret(
  tx: Tx,
  secretId: string,
): Promise<{ workspace_id: string; brand_id: string; ciphertext: Buffer; wrapped_key: Buffer; key_version: number } | null> {
  const result = await tx.query<{
    workspace_id: string;
    brand_id: string;
    ciphertext: Buffer;
    wrapped_key: Buffer;
    key_version: number;
  }>(
    `SELECT workspace_id, brand_id, ciphertext, wrapped_key, key_version FROM secret_vault
      WHERE id = $1 AND destroyed_at IS NULL`,
    [secretId],
  );
  return result.rows[0] ?? null;
}

/** نابودی راز: ciphertext و کلید بسته‌شده پاک می‌شوند و فقط رد زمان می‌ماند. */
export async function destroySecret(tx: Tx, secretId: string): Promise<void> {
  await tx.query(
    `UPDATE secret_vault SET ciphertext = ''::bytea, wrapped_key = ''::bytea, destroyed_at = now()
      WHERE id = $1 AND destroyed_at IS NULL`,
    [secretId],
  );
}
