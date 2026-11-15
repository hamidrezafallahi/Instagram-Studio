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

export const copywriter: AgentRole<CopywriterInput, DraftOutput> = {
  role: 'copywriter',
  title_fa: 'نویسنده',
  prompt_version: 'copywriter-template-1.0.0',
  output_schema: DraftOutput,
  max_calls: 1,
  timeout_ms: 15_000,
  allowed_modes: ['template'],
  tool_allowlist: [],
  authority_fa: 'فقط پیش‌نویس نسخه‌دار؛ بدون ارسال یا انتشار.',
  template: writeDraft,
};
