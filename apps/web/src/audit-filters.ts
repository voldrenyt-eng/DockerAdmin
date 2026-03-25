export const defaultAuditFilterValue = "all";
export const defaultAuditPage = 1;
export const defaultAuditPageSize = 25;

export type AuditFilterState = {
  action: string;
  entityType: string;
  page: number;
  pageSize: number;
  query: string;
};

const normalizeFilterValue = (value: string | null | undefined): string => {
  const normalizedValue = value?.trim() ?? "";

  if (normalizedValue.length === 0) {
    return defaultAuditFilterValue;
  }

  return normalizedValue;
};

const normalizePositiveInteger = (
  value: string | null | undefined,
  fallbackValue: number,
): number => {
  const normalizedValue = Number(value?.trim() ?? "");

  if (!Number.isInteger(normalizedValue) || normalizedValue < 1) {
    return fallbackValue;
  }

  return normalizedValue;
};

export const readAuditFilterState = (
  searchParams: URLSearchParams,
): AuditFilterState => {
  return {
    action: normalizeFilterValue(searchParams.get("action")),
    entityType: normalizeFilterValue(searchParams.get("entityType")),
    page: normalizePositiveInteger(searchParams.get("page"), defaultAuditPage),
    pageSize: normalizePositiveInteger(
      searchParams.get("pageSize"),
      defaultAuditPageSize,
    ),
    query: searchParams.get("q")?.trim() ?? "",
  };
};

export const createAuditFilterSearchParams = (
  state: AuditFilterState,
): URLSearchParams => {
  const searchParams = new URLSearchParams();
  const query = state.query.trim();
  const action = normalizeFilterValue(state.action);
  const entityType = normalizeFilterValue(state.entityType);

  if (query.length > 0) {
    searchParams.set("q", query);
  }

  if (action !== defaultAuditFilterValue) {
    searchParams.set("action", action);
  }

  if (entityType !== defaultAuditFilterValue) {
    searchParams.set("entityType", entityType);
  }

  if (state.page !== defaultAuditPage) {
    searchParams.set("page", String(state.page));
  }

  if (state.pageSize !== defaultAuditPageSize) {
    searchParams.set("pageSize", String(state.pageSize));
  }

  return searchParams;
};

const normalizeStateValue = (
  value: string | number | undefined,
  fallbackValue: string | number,
): string | number => {
  if (typeof fallbackValue === "number") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return fallbackValue;
    }

    return value;
  }

  if (typeof value !== "string") {
    return fallbackValue;
  }

  return normalizeFilterValue(value);
};

export const applyAuditFilterStatePatch = (
  state: AuditFilterState,
  patch: Partial<AuditFilterState>,
): AuditFilterState => {
  const nextState: AuditFilterState = {
    action: normalizeStateValue(
      patch.action,
      state.action,
    ) as AuditFilterState["action"],
    entityType: normalizeStateValue(
      patch.entityType,
      state.entityType,
    ) as AuditFilterState["entityType"],
    page: normalizeStateValue(
      patch.page,
      state.page,
    ) as AuditFilterState["page"],
    pageSize: normalizeStateValue(
      patch.pageSize,
      state.pageSize,
    ) as AuditFilterState["pageSize"],
    query: typeof patch.query === "string" ? patch.query : state.query,
  };

  const shouldResetPage =
    nextState.query !== state.query ||
    nextState.action !== state.action ||
    nextState.entityType !== state.entityType ||
    nextState.pageSize !== state.pageSize;

  if (shouldResetPage) {
    nextState.page = defaultAuditPage;
  }

  return nextState;
};

export const buildAuditPageNumbers = (input: {
  currentPage: number;
  totalPages: number;
}): number[] => {
  if (input.totalPages < 1) {
    return [];
  }

  const maxVisiblePages = 5;
  let startPage = Math.max(1, input.currentPage - 2);
  const endPage = Math.min(input.totalPages, startPage + maxVisiblePages - 1);

  startPage = Math.max(1, endPage - maxVisiblePages + 1);

  return Array.from(
    { length: endPage - startPage + 1 },
    (_unused, index) => startPage + index,
  );
};

export const hasActiveAuditFilters = (state: AuditFilterState): boolean => {
  return (
    state.query.trim().length > 0 ||
    state.action !== defaultAuditFilterValue ||
    state.entityType !== defaultAuditFilterValue
  );
};
