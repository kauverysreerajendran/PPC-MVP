"use client";

import { useQuery } from "@tanstack/react-query";
import { masterdataApi } from "@/features/masterdata/api";
import type { SapOutward } from "@/features/masterdata/types";

/**
 * The box a tray's stock came in. The Rack service keeps only the SAP
 * reference on a tray; the box UID lives on that SAP outward line in
 * Masterdata, so it is looked up there by reference.
 */
export function useBoxUid(sapReferenceId: string | null | undefined) {
  const ref = sapReferenceId?.trim() || null;
  const query = useQuery({
    queryKey: ["masterdata", "sap-outwards", "box-uid", ref],
    queryFn: ({ signal }) =>
      masterdataApi<SapOutward>("sap-outwards").list({ refs: ref!, page_size: 1 }, { signal }),
    enabled: !!ref,
    staleTime: 60_000,
    select: (page) => page.items.find((l) => l.sap_reference_id === ref)?.box_uid ?? null,
  });
  return { boxUid: query.data ?? null, isLoading: !!ref && query.isLoading };
}
