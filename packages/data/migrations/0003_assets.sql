-- 0003_assets — دارایی‌های رسانه و نسخه‌بندی آن‌ها (مرحلهٔ M3.2)
-- هر ردیف immutable است: فایل تازه یا ویرایش‌شده یعنی ردیف تازه با parent_asset_id و version بعدی.
-- چون نسخهٔ محتوا (content_revisions.asset_ids) به شناسهٔ ردیف اشاره می‌کند و ردیف تغییرپذیر نیست،
-- هر تغییر تصویر هش نسخه را عوض می‌کند و تأیید قبلی باطل می‌شود (ADR-005، A04).
-- خود فایل بیرون از پایگاه داده در STUDIO_HOME/assets با کلید محتوامحور ذخیره می‌شود.

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'font', 'logo', 'subtitle')),
  provenance text NOT NULL CHECK (provenance IN ('owner_upload', 'rendered', 'canva_import', 'sample')),
  mime text NOT NULL CHECK (length(mime) BETWEEN 3 AND 100),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms > 0),
  language text,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
  title_fa text NOT NULL CHECK (length(title_fa) BETWEEN 1 AND 200),
  -- مجوز استفاده (مثلاً «اثر خود مالک» یا OFL)؛ consent برای چهره/صدای اشخاص.
  license text NOT NULL CHECK (length(license) BETWEEN 1 AND 300),
  consent text NOT NULL CHECK (consent IN ('not_applicable', 'obtained', 'missing')),
  storage_key text NOT NULL,
  parent_asset_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  -- فراداده‌ای مثل قالب و ورودی رندر؛ بدون راز.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_sample boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, brand_id, id),
  CONSTRAINT assets_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id),
  CONSTRAINT assets_parent_scope_fkey FOREIGN KEY (workspace_id, brand_id, parent_asset_id)
    REFERENCES assets (workspace_id, brand_id, id),
  CHECK ((parent_asset_id IS NULL) = (version = 1))
);
-- یک فایل یکسان در یک برند فقط یک بار ثبت می‌شود؛ upload تکراری همان ردیف را برمی‌گرداند.
CREATE UNIQUE INDEX assets_checksum_key ON assets (brand_id, checksum, kind);
CREATE UNIQUE INDEX assets_version_key ON assets (parent_asset_id, version) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX assets_brand_idx ON assets (brand_id, created_at DESC);
CREATE TRIGGER assets_immutable BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY assets_isolation ON assets
  USING (workspace_id = app.current_workspace_id()
         AND (app.current_brand_id() IS NULL OR brand_id = app.current_brand_id()))
  WITH CHECK (workspace_id = app.current_workspace_id()
              AND (app.current_brand_id() IS NULL OR brand_id = app.current_brand_id()));

GRANT SELECT, INSERT ON assets TO studio_app;
