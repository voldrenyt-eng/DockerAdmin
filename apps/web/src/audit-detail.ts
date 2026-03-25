import type { AuditLogDto } from "@dockeradmin/shared";

import type { AuditFilterState } from "./audit-filters";
import { createAuditFilterSearchParams } from "./audit-filters";

export const readSelectedAuditId = (
  searchParams: URLSearchParams,
): string | null => {
  const selectedAuditId = searchParams.get("selected")?.trim() ?? "";

  if (selectedAuditId.length === 0) {
    return null;
  }

  return selectedAuditId;
};

export const createAuditDetailSearchParams = (input: {
  filterState: AuditFilterState;
  selectedAuditId: string | null;
}): URLSearchParams => {
  const searchParams = createAuditFilterSearchParams(input.filterState);
  const selectedAuditId = input.selectedAuditId?.trim() ?? "";

  if (selectedAuditId.length > 0) {
    searchParams.set("selected", selectedAuditId);
  }

  return searchParams;
};

export const resolveSelectedAuditLog = (
  visibleAuditLogs: AuditLogDto[],
  selectedAuditId: string | null,
): AuditLogDto | null => {
  if (!selectedAuditId) {
    return null;
  }

  return (
    visibleAuditLogs.find((auditLog) => auditLog.id === selectedAuditId) ?? null
  );
};
