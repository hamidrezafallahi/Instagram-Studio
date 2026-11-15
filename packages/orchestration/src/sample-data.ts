import { StudioError, type BrandProfile, type BrandSummary } from '@studio/contracts';
import type { BrandService } from './brands.ts';
import type { ConnectionService } from './connections.ts';
import type { StudioDeps, WorkspaceCall } from './context.ts';

/**
 * دادهٔ نمونهٔ چهار برند (docs/HANDOVER.md). همه ساختگی‌اند، برچسب sample دارند و هیچ کلید یا راز واقعی ندارند.
 * هیچ عدد فنی، قیمت، نام مشتری یا ادعایی در آن‌ها نیست؛ جاهایی عمداً خالی مانده‌اند تا رفتار
 * «نیاز به اطلاعات مالک» هم در دمو دیده شود.
 */
interface SampleBrand {
  name: string;
  pack: string;
  fill(profile: BrandProfile): void;
}

const SAMPLES: readonly SampleBrand[] = [
  {
    name: 'نمونه — استودیو وب',
    pack: 'web-services',
    fill(profile) {
      profile.identity.tagline = 'برند ساختگی برای نمایش روند کار';
      profile.offers = [
        { id: 'online_shop', title: 'طراحی فروشگاه اینترنتی', kind: 'service', is_sample: true,
          description: 'طراحی و راه‌اندازی فروشگاه اینترنتی با پنل مدیریت و اتصال به درگاه پرداخت. (توضیح نمونه)' },
        { id: 'company_site', title: 'سایت شرکتی', kind: 'service', is_sample: true,
          description: 'سایت معرفی شرکت با صفحه‌های خدمات، دربارهٔ ما و تماس. (توضیح نمونه)' },
      ];
      profile.audience = {
        summary: 'صاحبان کسب‌وکارهای کوچک که می‌خواهند فروش یا معرفی آنلاین را شروع کنند.',
        segments: ['فروشگاه‌های تازه‌کار', 'آموزشگاه‌ها'],
      };
      profile.voice = { tone: 'ساده، محترمانه و بدون اغراق', rules: ['از وعدهٔ قطعی پرهیز شود.', 'جمله‌ها کوتاه باشند.'], sample_texts: [] };
      profile.pack_fields = {
        services: 'فروشگاه اینترنتی، سایت شرکتی و سایت آموزشگاهی. (نمونه)',
        stacks: 'فهرست فناوری‌ها را مالک وارد می‌کند. (نمونه)',
        process: '۱) جلسهٔ شناخت نیاز ۲) پیشنهاد و برآورد ۳) طراحی رابط ۴) پیاده‌سازی ۵) آزمون و تحویل ۶) پشتیبانی. (نمونه)',
        meeting: 'جلسهٔ آنلاین نیم‌ساعته با هماهنگی قبلی. (نمونه)',
        price_range: 'به دامنهٔ کار بستگی دارد و پس از جلسهٔ اول برآورد می‌شود. (نمونه)',
      };
    },
  },
  {
    name: 'نمونه — لوپ دندان‌پزشکی',
    pack: 'dental-loupes',
    fill(profile) {
      profile.identity.tagline = 'برند ساختگی برای نمایش روند کار';
      profile.offers = [
        { id: 'model_a', title: 'لوپ مدل نمونه', kind: 'product', sku: 'SAMPLE-A', availability: 'unknown', is_sample: true,
          description: 'مشخصات این مدل باید از کاتالوگ رسمی سازنده وارد شود. (دادهٔ نمونه، بدون عدد فنی)' },
      ];
      profile.audience = {
        summary: 'دندان‌پزشکان و دانشجویان دندان‌پزشکی که در حال انتخاب لوپ هستند.',
        segments: ['دندان‌پزشکان عمومی', 'دانشجویان سال آخر'],
      };
      profile.voice = { tone: 'دقیق و مستند، بدون توصیهٔ بالینی', rules: ['هر مشخصه فقط از کاتالوگ همان مدل.'], sample_texts: [] };
      // catalog، models، specs و images عمداً خالی‌اند تا علامت «اطلاعات مالک لازم است» دیده شود.
      profile.pack_fields = {
        stock_price: 'موجودی و قیمت با استعلام روز اعلام می‌شود. (نمونه)',
        warranty: 'شرایط ضمانت مطابق برگهٔ ضمانت هر محصول است. (نمونه)',
        contact: 'پیام در همین صفحه یا تماس در ساعت اداری. (نمونه)',
      };
    },
  },
  {
    name: 'نمونه — آموزشگاه زبان',
    pack: 'language-school',
    fill(profile) {
      profile.identity.tagline = 'برند ساختگی برای نمایش روند کار';
      profile.offers = [
        { id: 'german_a1', title: 'دورهٔ آلمانی سطح مقدماتی', kind: 'course', availability: 'unknown', is_sample: true,
          description: 'دورهٔ آنلاین گروهی برای شروع از پایه. (توضیح نمونه)' },
      ];
      profile.audience = {
        summary: 'بزرگسالانی که برای کار یا تحصیل زبان دوم یاد می‌گیرند.',
        segments: ['دانشجویان', 'شاغلان'],
      };
      profile.voice = { tone: 'دوستانه و تشویق‌کننده، بدون وعدهٔ نتیجه', rules: ['قول نمره یا مهاجرت داده نشود.'], sample_texts: [] };
      profile.pack_fields = {
        languages: 'آلمانی و انگلیسی. (نمونه)',
        levels: 'مقدماتی تا متوسط. (نمونه)',
        course_calendar: 'تاریخ شروع و ساعت هر دوره را مالک وارد می‌کند. (نمونه، بدون تاریخ واقعی)',
        tuition: 'شهریه با استعلام اعلام می‌شود. (نمونه)',
        capacity: 'ظرفیت هر کلاس را مالک وارد می‌کند. (نمونه)',
        enrollment_link: 'https://sample.invalid/enroll',
      };
    },
  },
  {
    name: 'نمونه — کریستال و دکوری',
    pack: 'crystal-decor',
    fill(profile) {
      profile.identity.tagline = 'برند ساختگی برای نمایش روند کار';
      profile.offers = [
        { id: 'vase', title: 'گلدان کریستال', kind: 'product', sku: 'SAMPLE-VASE', availability: 'unknown', is_sample: true,
          description: 'ابعاد، رنگ و موجودی از مشخصات همان کالا وارد می‌شود. (دادهٔ نمونه)' },
      ];
      profile.audience = {
        summary: 'خریداران هدیه و علاقه‌مندان دکور خانه.',
        segments: ['خریداران هدیهٔ عروسی', 'علاقه‌مندان چیدمان'],
      };
      profile.voice = { tone: 'گرم و ساده', rules: ['مشخصات فقط از همان کالا.'], sample_texts: [] };
      profile.pack_fields = {
        skus: 'فهرست کالاها را مالک وارد می‌کند. (نمونه)',
        packaging: 'بسته‌بندی ضدضربه با جعبهٔ مقوایی. (نمونه)',
        shipping: 'ارسال طبق سیاست فروشگاه انجام می‌شود. (نمونه)',
        returns: 'شرایط بازگرداندن کالا را مالک وارد می‌کند. (نمونه)',
        care: 'شست‌وشو با آب ولرم و دستمال نرم؛ از شویندهٔ ساینده استفاده نشود. (نمونه)',
      };
    },
  },
];

export function createSampleDataService(deps: StudioDeps, brands: BrandService, connections: ConnectionService) {
  return {
    /**
     * چهار برند نمونه و برای هر کدام یک اتصال نمونه می‌سازد. تکرارپذیر است: برندی که نامش وجود دارد
     * دوباره ساخته نمی‌شود. فقط وقتی دادهٔ نمونه در تنظیمات اجرا فعال باشد کار می‌کند.
     */
    async seed(call: WorkspaceCall): Promise<BrandSummary[]> {
      if (!deps.settings.sampleData) {
        throw new StudioError('FORBIDDEN', { message_fa: 'دادهٔ نمونه در این نصب غیرفعال است.' });
      }
      const existing = new Set((await brands.list(call)).map((brand) => brand.name));
      for (const sample of SAMPLES) {
        if (existing.has(sample.name)) continue;
        const created = await brands.create(call, {
          name: sample.name,
          industry_pack_id: sample.pack,
          is_sample: true,
        });
        const profile = structuredClone(created.profile);
        sample.fill(profile);
        const brandCall = { ...call, brand_id: created.brand.id };
        await brands.updateProfile(brandCall, { expected_revision: created.brand.current_revision, profile });
        await connections.create(brandCall, {
          provider: 'fake',
          label: 'اتصال نمونه',
          config: { scenario: 'happy', channel: 'instagram' },
        });
      }
      return (await brands.list(call)).filter((brand) => brand.is_sample);
    },
  };
}

export type SampleDataService = ReturnType<typeof createSampleDataService>;
