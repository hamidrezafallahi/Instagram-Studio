# قراردادهای هسته — مرجع ساخت schema
سازنده از این متن JSON Schema و OpenAPI نسخه‌دار بسازد؛ جزئیات endpoint ارائه‌دهنده جداست.
## موجودیت‌های مبادله
| نوع | فیلدهای الزامی |
|---|---|
| BrandContext | workspace_id، brand_id، revision، industry_pack، locale، audience، offers، voice_rules، evidence_ids |
| ContentBrief | id، brand_id، goal، audience، pillar، channel، format، source_ids، CTA، due_at |
| ContentRevision | content_id، revision، brand_id، text، asset_ids، source_refs، claims، qa_result، hash |
| PublicationTarget | connection_id، channel، format، destination_id، scheduled_at_utc، timezone |
| ActionIntent | id، workspace_id، brand_id، actor_id، action_type، target، payload_ref، payload_hash، revision، idempotency_key، estimated_cost، expires_at |
| Approval | intent_id، payload_hash، approver_id، decision، approved_at، expires_at، policy_revision |
| Capability | connection_id، action، status، reason_code، limits، scopes، evidence_url، verified_at، expires_at |
| ConnectorResult | status، external_id، external_url، provider_request_id، retry_after، error_code، cost_actual، evidence_ref |
| FundingRequest | id، brand_id، provider، purpose، amount، currency، quote_expires_at، payment_mode، status |
| Event | event_id، schema_version، workspace_id، brand_id، aggregate_id، aggregate_version، event_type، occurred_at، correlation_id، payload_ref |

status برای ConnectorResult: succeeded / accepted / failed / unknown / manual_required. accepted به معنی انتشار نیست.
پول: عدد صحیح واحد خرد به همراه currency؛ IRR و IRT جدا و نمایش واحد اجباری؛ float برای بودجه ممنوع.
زمان: RFC3339 UTC؛ locale و timezone مستقل. identifier داخلی UUID؛ provider id رشته بدون فرض عددی.
دادهٔ محرمانه فقط secret_ref؛ هیچ token واقعی در ساختارهای عمومی قرار نگیرد.

## Portهای کانکتور
discoverCapabilities، validateConnection، prepareMedia، publish، getOperationStatus، fetchMetrics، listConversations، sendReply، revoke.
هر متد قبل از اجرا capability می‌خواهد؛ نبود قابلیت خطای UNSUPPORTED_CAPABILITY است، نه موفقیت تهی.
publish یک مقصد در هر action؛ بستهٔ چندکاناله parent_run با child مستقل دارد.
خطاهای مشترک: AUTH_EXPIRED، RATE_LIMITED، QUOTA_EXHAUSTED، PAYMENT_REQUIRED، INVALID_MEDIA، POLICY_DENIED، PROVIDER_UNAVAILABLE، UNKNOWN_OUTCOME، STALE_REVISION.
Provider payload فقط در adapter؛ domain به Instagram container یا Zernio profile وابسته نباشد.
