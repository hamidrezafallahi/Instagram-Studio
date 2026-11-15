'use client';

import type { BrandSummary } from '@studio/contracts';
import { useParams } from 'next/navigation';
import type { CalendarMode } from './format.ts';
import { useReadySession, useSession } from './session.tsx';

export interface BrandScope {
  workspaceId: string;
  brandId: string;
  /** پارامترهای مسیر همهٔ فراخوان‌های این برند. */
  params: { workspace_id: string; brand_id: string };
  summary: BrandSummary | null;
  calendar: CalendarMode;
  sampleDataEnabled: boolean;
  reloadBrands: () => Promise<void>;
}

/** زمینهٔ برند جاری از نشانی صفحه؛ همهٔ داده‌ها با همین شناسه از سرور خواسته می‌شوند. */
export function useBrand(): BrandScope {
  const { workspaceId, setup } = useReadySession();
  const { brands, calendar, reloadBrands } = useSession();
  const { brandId } = useParams<{ brandId: string }>();
  return {
    workspaceId,
    brandId,
    params: { workspace_id: workspaceId, brand_id: brandId },
    summary: brands?.find((brand) => brand.id === brandId) ?? null,
    calendar,
    sampleDataEnabled: setup.sample_data,
    reloadBrands,
  };
}
