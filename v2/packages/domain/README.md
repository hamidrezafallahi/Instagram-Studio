# دامنه و ماشین حالت
## مدل برند
Workspace سازمان/مالک، Brand واحد کسب‌وکار مستقل؛ مالک چند Brand دارد. membership و scope در هر brand قابل محدودسازی.
حساب اجتماعی، سایت، حافظه، asset، lead و budget به brand تعلق دارند. انتقال حساب برند به برند عملیات صریح و auditشده است.

## حالت‌ها
Content: brief → researching → drafting → validating → ready_for_review → approved → scheduled → publishing → published.
شاخه‌ها: needs_revision، blocked، cancelled، publishing_unknown، failed. هر ویرایش revision جدید و برگشت به review.
Run: queued/running/waiting_for_input/waiting_for_approval/waiting_for_funds/waiting_for_harness/paused/succeeded/partially_succeeded/failed/cancelled.
Action: proposed → authorized → reserved → executing → succeeded؛ یا awaiting_approval، denied، awaiting_funds، failed، unknown، manual_required.
ManualTask: prepared → assigned → completed_by_owner → verified یا unverifiable.
Inbox: received → classified → draft_reply → review/auto_authorized → sent یا human_handoff.
FundingRequest: proposed → owner_approved → awaiting_payment → verifying → funded؛ declined/expired/cancelled.
شارژشدن اعتبار، مجوز محتوای منتشرنشده یا کمپین تأییدنشده نیست.

## قواعد ثابت
انتشار فقط برای revision تأییدشده یا auto_scoped معتبر، capability قابل استفاده و دارایی QA-pass.
برای یک content revision + destination + operation، فقط یک side effect منطقی.
هر انتقال وضعیت optimistic version check داشته باشد؛ آخرین نویسنده نباید تغییر قبلی را بی‌صدا حذف کند.
اتمام parent_run از نتیجهٔ children محاسبه شود؛ شکست یک کانال باعث ارسال مجدد کانال موفق نشود.
تأیید دستی یک URL تا زمانی که مالکیت و تطابق قابل بررسی نیست با برچسب owner_reported باقی بماند.
پذیرش: transition غیرمجاز، cross-brand reference و approval منقضی رد شوند.
