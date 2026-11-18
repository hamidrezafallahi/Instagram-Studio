import {
  Claim,
  SourceRef,
  type BrandProfile,
  type Channel,
  type ContentFormat,
  type IndustryPack,
  type PackField,
} from '@studio/contracts';
import { faDigits, normalizePersian, ownerInputMarker } from '@studio/domain';
import { z } from 'zod';
import type { AgentRole } from './types.ts';

export interface CopywriterInput {
  profile: BrandProfile;
  pack: IndustryPack;
  brand_revision: number;
  entry: {
    channel: Channel;
    format: ContentFormat;
    pillar: string;
    topic_fa: string;
    goal_fa: string;
    cta_fa: string;
  };
}

export const DraftOutput = z.strictObject({
  title_fa: z.string().min(1).max(300),
  text: z.string().min(1).max(20_000),
  source_refs: z.array(SourceRef).max(40),
  claims: z.array(Claim).max(40),
  open_questions_fa: z.array(z.string().max(400)).max(20),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

interface Section {
  heading: string;
  body: string;
}

const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[^a-z]+/, '').slice(0, 56) || 'item';

function hashtag(value: string): string | null {
  const tag = value.replace(/[\s‌]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').replace(/^_+|_+$/g, '');
  return tag.length >= 2 && tag.length <= 40 ? `#${tag}` : null;
}

/**
 * پیش‌نویس قالبی: فقط از دادهٔ ثبت‌شدهٔ برند (خدمت، مخاطب، پاسخ مالک به فیلدهای بستهٔ صنعت) استفاده می‌کند.
 * هر جا اطلاعات لازم نیست، به‌جای حدس‌زدن علامت «اطلاعات مالک لازم است» می‌گذارد تا QA آن را برگرداند.
 * هیچ عدد، نام مشتری، نمونه‌کار یا ادعایی از خود ساخته نمی‌شود.
 */
function writeDraft(input: CopywriterInput): DraftOutput {
  const { profile, pack, entry } = input;
  const pillar = pack.content_pillars.find((item) => item.id === entry.pillar);
  const fields = new Map<string, PackField>(
    [...pack.required_fields, ...pack.faq_fields].map((field) => [field.key, field]),
  );
  const offer = profile.offers.find((item) => entry.topic_fa.includes(item.title)) ?? profile.offers[0];
  const openQuestions: string[] = [];
  const sourceRefs: SourceRef[] = [
    { source_id: 'brand_profile', kind: 'brand_profile', label: `سند برند، نسخهٔ ${faDigits(input.brand_revision)}` },
    { source_id: slug(`pack_${pack.id}`), kind: 'industry_pack', label: `بستهٔ صنعت «${pack.name_fa}» نسخهٔ ${faDigits(pack.version)}` },
  ];

  const sections: Section[] = [];
  if (offer?.description) {
    sections.push({ heading: offer.title, body: offer.description });
    sourceRefs.push({ source_id: slug(`offer_${offer.id}`), kind: 'offer', label: `خدمت/کالا: ${offer.title}` });
  }

  const sourceKeys = pillar?.source_fields ?? [];
  let answered = 0;
  for (const key of sourceKeys) {
    const field = fields.get(key);
    if (!field) continue;
    const answer = (profile.pack_fields[key] ?? '').trim();
    if (answer) {
      answered += 1;
      sections.push({ heading: field.label_fa, body: answer });
      sourceRefs.push({ source_id: slug(`field_${key}`), kind: 'brand_profile', label: `پاسخ مالک: ${field.label_fa}` });
    } else if (field.required) {
      sections.push({ heading: field.label_fa, body: ownerInputMarker(field.label_fa) });
      openQuestions.push(`«${field.label_fa}» در اطلاعات برند خالی است.`);
    }
  }
  if (answered === 0) {
    const label = `نکتهٔ اصلی این مطلب (ستون «${pillar?.title_fa ?? entry.pillar}»)`;
    sections.push({ heading: 'نکتهٔ اصلی', body: ownerInputMarker(label) });
    openQuestions.push(
      'تولید قالبی دانش تخصصی ندارد؛ نکتهٔ اصلی این مطلب را خودتان بنویسید یا پس از فعال‌شدن مدل زبانی دوباره تولید کنید.',
    );
  }
  if (pillar?.requires_evidence) {
    openQuestions.push('این ستون به مدرک واقعی و اجازهٔ انتشار نیاز دارد؛ منبع مرتبط را پیش از تأیید بررسی کنید.');
    for (const evidence of profile.evidence.slice(0, 5)) {
      sourceRefs.push({
        source_id: evidence.id,
        kind: 'evidence',
        label: evidence.title,
        ...(evidence.checked_at ? { checked_at: evidence.checked_at } : {}),
      });
    }
  }

  const hook = entry.topic_fa;
  const cta = entry.cta_fa.trim();
  const tags =
    entry.channel === 'instagram'
      ? [hashtag(profile.identity.name), offer ? hashtag(offer.title) : null, pillar ? hashtag(pillar.title_fa) : null]
          .filter((tag): tag is string => tag !== null)
          .filter((tag, index, all) => all.indexOf(tag) === index)
      : [];

  const block = (section: Section): string => `${section.heading}:\n${section.body}`;
  const lines: string[] = [];
  switch (entry.format) {
    case 'carousel': {
      lines.push(`اسلاید ۱ (کاور): ${hook}`);
      sections.forEach((section, index) => {
        lines.push(`اسلاید ${faDigits(index + 2)} — ${section.heading}:\n${section.body}`);
      });
      if (cta) lines.push(`اسلاید پایانی: ${cta}`);
      lines.push(`کپشن:\n${hook}${cta ? `\n${cta}` : ''}`);
      break;
    }
    case 'reel':
    case 'trial_reel': {
      lines.push(`قلاب (سه ثانیهٔ اول): ${hook}`);
      sections.forEach((section, index) => {
        lines.push(`بخش ${faDigits(index + 1)} — ${section.heading}:\n${section.body}`);
      });
      if (cta) lines.push(`جمع‌بندی و دعوت به اقدام: ${cta}`);
      lines.push(`متن روی تصویر: ${hook}`);
      lines.push(`کپشن:\n${hook}${cta ? `\n${cta}` : ''}`);
      break;
    }
    case 'story': {
      lines.push(`فریم ۱: ${hook}`);
      sections.forEach((section, index) => {
        lines.push(`فریم ${faDigits(index + 2)} — ${section.heading}:\n${section.body}`);
      });
      if (cta) lines.push(`فریم پایانی: ${cta}`);
      break;
    }
    case 'article': {
      lines.push(`عنوان: ${hook}`);
      if (profile.audience.summary) lines.push(`این مطلب برای چه کسی است: ${profile.audience.summary}`);
      for (const section of sections) lines.push(`## ${section.heading}\n${section.body}`);
      if (cta) lines.push(`## قدم بعدی\n${cta}`);
      break;
    }
    default: {
      lines.push(hook);
      for (const section of sections) lines.push(block(section));
      if (cta) lines.push(cta);
    }
  }
  if (tags.length > 0) lines.push(tags.join(' '));

  return {
    title_fa: hook.slice(0, 300),
    text: normalizePersian(lines.join('\n\n')),
    source_refs: sourceRefs,
    // ادعاها را editor-qa از روی متن نهایی استخراج می‌کند تا با ویرایش انسانی هم‌خوان بماند.
    claims: [],
    open_questions_fa: openQuestions,
  };
}

/* ───────────────────────────── مسیر مدل زبانی ───────────────────────────── */

/** آنچه مدل برمی‌گرداند؛ منبع‌ها و ادعاها را کد از دادهٔ برند و QA می‌سازد، نه مدل. */
export const ModelDraft = z.object({
  title_fa: z.string().trim().min(1).max(300),
  text: z.string().trim().min(20).max(20_000),
  open_questions_fa: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
});
export type ModelDraft = z.infer<typeof ModelDraft>;

const FORMAT_GUIDE: Partial<Record<ContentFormat, string>> = {
  carousel: [
    'کاروسل ۶ تا ۹ اسلاید با این ساختار (متن داخل [] را با محتوای واقعی جایگزین کنید و خود [] را ننویسید):',
    'اسلاید ۱ (کاور): [قلاب کوتاه]',
    'اسلاید ۲ — [تیتر این اسلاید]:',
    '[یک تا سه جملهٔ توضیح؛ حداکثر حدود ۳۵ کلمه؛ یک ایده و یک نکتهٔ قابل‌استفاده]',
    '… (اسلایدهای میانی به همین شکل؛ هر اسلاید تیتر و توضیح دارد)',
    'اسلاید پایانی: [دعوت به اقدام]',
    'کپشن:',
    '[خط اول: قلاب مستقل] [بدنهٔ کوتاه] [دعوت به اقدام] [هشتگ‌ها]',
    'تعداد مواردی که در کپشن نام می‌برید باید با تعداد اسلایدهای محتوا یکی باشد. عدد اعشاری فارسی با «٫» (مثل ۲٫۵).',
  ].join('\n'),
  reel: [
    'اسکریپت ریلز ۳۰ تا ۶۰ ثانیه. بخش‌ها: «قلاب (سه ثانیهٔ اول): …»، «بخش ۱ — [تیتر]:»، «بخش ۲ — [تیتر]:» (گفتار محاوره‌ای سبک و مؤدبانه)، «جمع‌بندی و دعوت به اقدام: …»، «متن روی تصویر: …» (کوتاه)، سپس «کپشن:».',
    'هر بخش یک فریم ویدئوست و تیترش روی تصویر می‌آید: تیتر، خلاصهٔ محتوایی همان بخش در ۲ تا ۶ کلمه است (مثل «فرم خرید طولانی»)، نه برچسبی مثل «توضیح» یا «بخش اول». هر بخش حداکثر حدود ۳۵ کلمه.',
  ].join('\n'),
  trial_reel: 'مثل ریلز: قلاب، بخش‌ها، جمع‌بندی و دعوت به اقدام، متن روی تصویر و «کپشن:».',
  story:
    'سکانس استوری ۳ تا ۶ فریم: «فریم ۱: …»، «فریم ۲ — …:» و «فریم پایانی: …». خط‌ها کوتاه و پرسشی؛ اگر استیکر نظرسنجی یا سؤال مناسب است، داخل پرانتز پیشنهاد بدهید.',
  post: 'پست تک‌تصویری: یک تیتر کوتاه برای تصویر و سپس «کپشن:».',
  article: 'مقاله: «عنوان: …»، چند بخش با «## » و بخش پایانی «## قدم بعدی».',
  text_post: 'پست متنی: خط اول قلاب، چند پاراگراف کوتاه، دعوت به اقدام.',
};

function bulletList(items: readonly string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- (ثبت نشده)';
}

/** prompt نویسنده: فقط دادهٔ ثبت‌شدهٔ همین برند؛ بدون دادهٔ شخصی یا پیام مشتری. */
export function buildCopywriterPrompt(input: CopywriterInput): { system: string; user: string } {
  const { profile, pack, entry } = input;
  const pillar = pack.content_pillars.find((item) => item.id === entry.pillar);
  const fields = [...pack.required_fields, ...pack.faq_fields];
  const answered = fields
    .filter((field) => (profile.pack_fields[field.key] ?? '').trim())
    .map((field) => `${field.label_fa}: ${profile.pack_fields[field.key]}`);
  const missing = fields
    .filter((field) => field.required && !(profile.pack_fields[field.key] ?? '').trim())
    .map((field) => field.label_fa);
  const forbidden = [
    ...profile.forbidden_claims,
    ...pack.claims_policy.rules.filter((rule) => rule.action === 'forbid').flatMap((rule) => rule.phrases),
  ];
  const instagram = entry.channel === 'instagram';

  const system = [
    `شما نویسندهٔ محتوای فارسی برند «${profile.identity.name}» هستید و فقط پیش‌نویس می‌نویسید؛ چیزی منتشر نمی‌شود و انسان پیش از انتشار بازبینی می‌کند.`,
    '',
    'قواعد قطعی:',
    '- فقط از اطلاعاتی که در پیام کاربر آمده استفاده کنید. هیچ مشتری، پروژه، عدد، درصد، نتیجه، نظر مشتری، سابقه یا قیمتی نسازید.',
    '- اگر برای نوشتن به اطلاعاتی نیاز دارید که داده نشده، دقیقاً این علامت را بگذارید: 〔اطلاعات مالک لازم است: توضیح کوتاه〕 و همان را در open_questions_fa هم بنویسید.',
    '- هیچ‌یک از عبارت‌های ممنوع فهرست‌شده را به کار نبرید؛ وعدهٔ قطعی، تضمین، صفت عالی بی‌مدرک و فشار فروش ممنوع است.',
    '- نگارش فارسی معیار: نیم‌فاصله (می‌شود، کسب‌وکار، سایت‌ها)، «ی» و «ک» فارسی، رقم فارسی در متن فارسی، نشانه‌گذاری فارسی (،؛؟) و گیومهٔ «». واژه‌های اداری (می‌باشد، نمودن، گردید) ممنوع.',
    '- دقیقاً یک دعوت به اقدام: همان متنی که داده شده، بدون تغییر.',
    instagram
      ? '- برای اینستاگرام در انتهای کپشن ۳ تا ۵ هشتگ مرتبط بگذارید؛ هشتگ نیم‌فاصله ندارد (به‌جایش «_»). حداکثر ۲ ایموجی و حداکثر یک «!».'
      : '- هشتگ نگذارید.',
    '- اصطلاح فنی انگلیسی با املای اصلی (React، SEO، API) و بار اول برای مخاطب غیرفنی توضیح کوتاه.',
    '',
    `لحن برند: ${profile.voice.tone || '(ثبت نشده)'}`,
    'قواعد لحن برند:',
    bulletList(profile.voice.rules),
    profile.voice.sample_texts.length ? `نمونه‌متن‌های برند (برای لحن، نه برای کپی):\n${bulletList(profile.voice.sample_texts)}` : '',
    'عبارت‌های ممنوع:',
    bulletList(forbidden),
    '',
    'خروجی: فقط یک شیء JSON، بدون هیچ توضیح یا markdown دیگر، با این کلیدها:',
    '{"title_fa": "عنوان کوتاه داخلی", "text": "متن کامل پیش‌نویس با ساختار خواسته‌شده", "open_questions_fa": ["پرسش از مالک دربارهٔ اطلاعات ناقص"]}',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const offers = profile.offers.map((offer) => `${offer.title}${offer.description ? `: ${offer.description}` : ''}`);
  const user = [
    `کانال: ${entry.channel}`,
    `قالب: ${entry.format}`,
    `ساختار قالب: ${FORMAT_GUIDE[entry.format] ?? 'متن کوتاه و روشن با یک دعوت به اقدام.'}`,
    `ستون محتوا: ${pillar ? `${pillar.title_fa} — ${pillar.description_fa}` : entry.pillar}`,
    `موضوع: ${entry.topic_fa}`,
    `هدف: ${entry.goal_fa || '(ثبت نشده)'}`,
    `دعوت به اقدام (عیناً): ${entry.cta_fa || '(ثبت نشده؛ یک دعوت کوتاه و بی‌فشار بنویسید)'}`,
    '',
    `معرفی برند: ${profile.identity.description ?? profile.identity.tagline ?? '(ثبت نشده)'}`,
    `مخاطب: ${profile.audience.summary || '(ثبت نشده)'}`,
    'بخش‌های مخاطب:',
    bulletList(profile.audience.segments),
    'خدمات/کالاها:',
    bulletList(offers),
    'پاسخ‌های مالک:',
    bulletList(answered),
    missing.length ? `اطلاعاتی که مالک هنوز نداده (اگر لازم شد علامت بگذارید): ${missing.join('، ')}` : '',
    pillar?.requires_evidence
      ? 'این ستون به مدرک واقعی و اجازهٔ مشتری نیاز دارد؛ چون مدرکی داده نشده، هیچ جزئیات پروژه ننویسید و جای آن علامت «اطلاعات مالک لازم است» بگذارید.'
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { system, user };
}

/** منبع‌ها از دادهٔ برند، مثل تولید قالبی؛ مدل منبع اعلام نمی‌کند. */
function finishModelDraft(input: CopywriterInput, draft: ModelDraft): DraftOutput {
  const { profile, pack, entry } = input;
  const text = normalizePersian(draft.text);
  const pillar = pack.content_pillars.find((item) => item.id === entry.pillar);
  const sourceRefs: SourceRef[] = [
    { source_id: 'brand_profile', kind: 'brand_profile', label: `سند برند، نسخهٔ ${faDigits(input.brand_revision)}` },
    { source_id: slug(`pack_${pack.id}`), kind: 'industry_pack', label: `بستهٔ صنعت «${pack.name_fa}» نسخهٔ ${faDigits(pack.version)}` },
  ];
  for (const offer of profile.offers) {
    if (text.includes(offer.title) || entry.topic_fa.includes(offer.title)) {
      sourceRefs.push({ source_id: slug(`offer_${offer.id}`), kind: 'offer', label: `خدمت/کالا: ${offer.title}` });
    }
  }
  const openQuestions = [...draft.open_questions_fa];
  if (pillar?.requires_evidence) {
    openQuestions.push('این ستون به مدرک واقعی و اجازهٔ انتشار نیاز دارد؛ منبع مرتبط را پیش از تأیید بررسی کنید.');
  }
  return {
    title_fa: normalizePersian(draft.title_fa).slice(0, 300),
    text,
    source_refs: sourceRefs.slice(0, 40),
    claims: [],
    open_questions_fa: openQuestions.slice(0, 20),
  };
}

export const copywriter: AgentRole<CopywriterInput, DraftOutput> = {
  role: 'copywriter',
  title_fa: 'نویسنده',
  prompt_version: 'copywriter-template-1.0.0',
  output_schema: DraftOutput,
  max_calls: 1,
  timeout_ms: 15_000,
  // مدل رایگان در اولویت است؛ اگر در دسترس نبود یا خروجی‌اش نامعتبر بود، تولید قالبی.
  allowed_modes: ['free_api', 'template'],
  tool_allowlist: [],
  authority_fa: 'فقط پیش‌نویس نسخه‌دار؛ بدون ارسال یا انتشار.',
  template: writeDraft,
  model: {
    prompt_version: 'copywriter-model-1.2.0',
    build: buildCopywriterPrompt,
    schema: ModelDraft,
    finish: finishModelDraft,
  },
};
