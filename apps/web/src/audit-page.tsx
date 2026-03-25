import type { AuditLogListResponseDto } from "@dockeradmin/shared";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { exportAuditLogsCsv, listAuditLogs } from "./audit";
import {
  createAuditDetailSearchParams,
  readSelectedAuditId,
  resolveSelectedAuditLog,
} from "./audit-detail";
import {
  applyAuditFilterStatePatch,
  buildAuditPageNumbers,
  defaultAuditFilterValue,
  defaultAuditPage,
  defaultAuditPageSize,
  hasActiveAuditFilters,
  readAuditFilterState,
} from "./audit-filters";
import { useI18n } from "./i18n-provider";

type AuditPageProps = {
  accessToken: string;
  apiBaseUrl: string;
  onAccessTokenExpired?: () => Promise<string | null>;
};

const emptyAuditLogListResponse = (): AuditLogListResponseDto => ({
  auditLogs: [],
  page: defaultAuditPage,
  pageSize: defaultAuditPageSize,
  total: 0,
  totalPages: 0,
});

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

const formatAuditTimestamp = (input: { locale: string; value: string }) => {
  const parsed = new Date(input.value);

  if (Number.isNaN(parsed.getTime())) {
    return input.value;
  }

  return new Intl.DateTimeFormat(input.locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(parsed);
};

const renderAuditValue = (
  value: string | null | undefined,
  emptyLabel: string,
) => {
  if (value && value.trim().length > 0) {
    return value;
  }

  return <span className="audit-empty-value">{emptyLabel}</span>;
};

const triggerAuditCsvDownload = (input: {
  content: string;
  filename: string;
}) => {
  const blob = new Blob([input.content], {
    type: "text/csv;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = input.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
};

export const AuditPage = ({
  accessToken,
  apiBaseUrl,
  onAccessTokenExpired,
}: AuditPageProps) => {
  const { locale, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [auditLogList, setAuditLogList] = useState<AuditLogListResponseDto>(
    () => emptyAuditLogListResponse(),
  );
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditExporting, setIsAuditExporting] = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const filterState = readAuditFilterState(searchParams);
  const hasFilters = hasActiveAuditFilters(filterState);
  const selectedAuditId = readSelectedAuditId(searchParams);
  const selectedAuditLog = resolveSelectedAuditLog(
    auditLogList.auditLogs,
    selectedAuditId,
  );
  const actionOptions = Array.from(
    new Set(auditLogList.auditLogs.map((auditLog) => auditLog.action)),
  ).sort();
  const entityTypeOptions = Array.from(
    new Set(auditLogList.auditLogs.map((auditLog) => auditLog.entityType)),
  ).sort();
  const pageNumbers = buildAuditPageNumbers({
    currentPage: auditLogList.page,
    totalPages: auditLogList.totalPages,
  });
  const visibleRangeStart =
    auditLogList.total === 0
      ? 0
      : (auditLogList.page - 1) * auditLogList.pageSize + 1;
  const visibleRangeEnd =
    auditLogList.total === 0
      ? 0
      : visibleRangeStart + auditLogList.auditLogs.length - 1;

  const loadAuditLogs = useCallback(async () => {
    if (accessToken.trim().length === 0) {
      setAuditLogList(emptyAuditLogListResponse());
      setAuditError(null);
      setIsAuditLoading(false);

      return;
    }

    setAuditError(null);
    setIsAuditLoading(true);

    try {
      const nextAuditLogs = await listAuditLogs(
        onAccessTokenExpired
          ? {
              action:
                filterState.action === defaultAuditFilterValue
                  ? ""
                  : filterState.action,
              accessToken,
              apiBaseUrl,
              entityType:
                filterState.entityType === defaultAuditFilterValue
                  ? ""
                  : filterState.entityType,
              onAccessTokenExpired,
              page: filterState.page,
              pageSize: filterState.pageSize,
              q: filterState.query,
            }
          : {
              action:
                filterState.action === defaultAuditFilterValue
                  ? ""
                  : filterState.action,
              accessToken,
              apiBaseUrl,
              entityType:
                filterState.entityType === defaultAuditFilterValue
                  ? ""
                  : filterState.entityType,
              page: filterState.page,
              pageSize: filterState.pageSize,
              q: filterState.query,
            },
      );

      setAuditLogList(nextAuditLogs);
    } catch (error) {
      setAuditError(toErrorMessage(error, t("app.audit.errors.listFallback")));
    } finally {
      setIsAuditLoading(false);
    }
  }, [
    accessToken,
    apiBaseUrl,
    filterState.action,
    filterState.entityType,
    filterState.page,
    filterState.pageSize,
    filterState.query,
    onAccessTokenExpired,
    t,
  ]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    if (!selectedAuditId || selectedAuditLog) {
      return;
    }

    setSearchParams(
      createAuditDetailSearchParams({
        filterState,
        selectedAuditId: null,
      }),
      {
        replace: true,
      },
    );
  }, [filterState, selectedAuditId, selectedAuditLog, setSearchParams]);

  useEffect(() => {
    if (
      auditLogList.page === filterState.page &&
      auditLogList.pageSize === filterState.pageSize
    ) {
      return;
    }

    setSearchParams(
      createAuditDetailSearchParams({
        filterState: {
          ...filterState,
          page: auditLogList.page,
          pageSize: auditLogList.pageSize,
        },
        selectedAuditId: null,
      }),
      {
        replace: true,
      },
    );
  }, [auditLogList.page, auditLogList.pageSize, filterState, setSearchParams]);

  const updateFilterState = (nextPartialState: Partial<typeof filterState>) => {
    setSearchParams(
      createAuditDetailSearchParams({
        filterState: applyAuditFilterStatePatch(filterState, nextPartialState),
        selectedAuditId: null,
      }),
      {
        replace: true,
      },
    );
  };

  const openAuditDrawer = (auditId: string) => {
    setSearchParams(
      createAuditDetailSearchParams({
        filterState,
        selectedAuditId: auditId,
      }),
      {
        replace: true,
      },
    );
  };

  const closeAuditDrawer = () => {
    setSearchParams(
      createAuditDetailSearchParams({
        filterState,
        selectedAuditId: null,
      }),
      {
        replace: true,
      },
    );
  };

  const goToPage = (page: number) => {
    setSearchParams(
      createAuditDetailSearchParams({
        filterState: applyAuditFilterStatePatch(filterState, {
          page,
        }),
        selectedAuditId: null,
      }),
      {
        replace: false,
      },
    );
  };

  const handleAuditExport = async () => {
    if (accessToken.trim().length === 0 || isAuditExporting) {
      return;
    }

    setAuditError(null);
    setIsAuditExporting(true);

    try {
      const exportPayload = await exportAuditLogsCsv(
        onAccessTokenExpired
          ? {
              action:
                filterState.action === defaultAuditFilterValue
                  ? ""
                  : filterState.action,
              accessToken,
              apiBaseUrl,
              entityType:
                filterState.entityType === defaultAuditFilterValue
                  ? ""
                  : filterState.entityType,
              onAccessTokenExpired,
              q: filterState.query,
            }
          : {
              action:
                filterState.action === defaultAuditFilterValue
                  ? ""
                  : filterState.action,
              accessToken,
              apiBaseUrl,
              entityType:
                filterState.entityType === defaultAuditFilterValue
                  ? ""
                  : filterState.entityType,
              q: filterState.query,
            },
      );

      triggerAuditCsvDownload(exportPayload);
    } catch (error) {
      setAuditError(
        toErrorMessage(error, t("app.audit.errors.exportFallback")),
      );
    } finally {
      setIsAuditExporting(false);
    }
  };

  return (
    <div className="audit-layout">
      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">{t("app.audit.eyebrow")}</p>
            <h2>{t("app.audit.listTitle")}</h2>
          </div>
          <div className="audit-panel-actions">
            <button
              className="secondary-button"
              disabled={isAuditExporting || accessToken.trim().length === 0}
              onClick={() => {
                void handleAuditExport();
              }}
              type="button"
            >
              {isAuditExporting
                ? t("app.audit.export.loading")
                : t("app.audit.export.action")}
            </button>
            <span className="panel-pill">{auditLogList.total}</span>
          </div>
        </div>

        <p className="panel-summary">{t("app.audit.panelSummary")}</p>

        <div className="field-grid audit-filters-grid">
          <div>
            <label className="field-label" htmlFor="audit-search">
              {t("app.audit.filters.searchLabel")}
            </label>
            <input
              className="text-input"
              id="audit-search"
              onChange={(event) => {
                updateFilterState({
                  query: event.target.value,
                });
              }}
              placeholder={t("app.audit.filters.searchPlaceholder")}
              type="search"
              value={filterState.query}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="audit-action-filter">
              {t("app.audit.filters.actionLabel")}
            </label>
            <select
              className="language-select"
              id="audit-action-filter"
              onChange={(event) => {
                updateFilterState({
                  action: event.target.value,
                });
              }}
              value={filterState.action}
            >
              <option value={defaultAuditFilterValue}>
                {t("app.audit.filters.actionAll")}
              </option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="audit-entity-type-filter">
              {t("app.audit.filters.entityTypeLabel")}
            </label>
            <select
              className="language-select"
              id="audit-entity-type-filter"
              onChange={(event) => {
                updateFilterState({
                  entityType: event.target.value,
                });
              }}
              value={filterState.entityType}
            >
              <option value={defaultAuditFilterValue}>
                {t("app.audit.filters.entityTypeAll")}
              </option>
              {entityTypeOptions.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </div>
        </div>

        {auditError ? (
          <p className="field-hint field-hint-error">
            {t("app.audit.errorPrefix")} {auditError}
          </p>
        ) : null}

        {isAuditLoading && auditLogList.total === 0 ? (
          <p className="empty-state">{t("app.audit.loading")}</p>
        ) : auditLogList.total === 0 && !hasFilters ? (
          <p className="empty-state">{t("app.audit.empty")}</p>
        ) : auditLogList.total === 0 ? (
          <p className="empty-state">{t("app.audit.filteredEmpty")}</p>
        ) : (
          <div className="services-table-wrap">
            <table className="services-table">
              <thead>
                <tr>
                  <th>{t("app.audit.columns.timestamp")}</th>
                  <th>{t("app.audit.columns.action")}</th>
                  <th>{t("app.audit.columns.entityType")}</th>
                  <th>{t("app.audit.columns.project")}</th>
                  <th>{t("app.audit.columns.message")}</th>
                </tr>
              </thead>
              <tbody>
                {auditLogList.auditLogs.map((auditLog) => {
                  const isSelected = selectedAuditLog?.id === auditLog.id;

                  return (
                    <tr
                      aria-selected={isSelected}
                      className={
                        isSelected ? "audit-row audit-row-active" : "audit-row"
                      }
                      key={auditLog.id}
                    >
                      <td>
                        <button
                          className="audit-row-button"
                          onClick={() => {
                            openAuditDrawer(auditLog.id);
                          }}
                          type="button"
                        >
                          {formatAuditTimestamp({
                            locale,
                            value: auditLog.createdAt,
                          })}
                        </button>
                      </td>
                      <td>
                        <button
                          className="audit-row-button"
                          onClick={() => {
                            openAuditDrawer(auditLog.id);
                          }}
                          type="button"
                        >
                          {auditLog.action}
                        </button>
                      </td>
                      <td>
                        <button
                          className="audit-row-button"
                          onClick={() => {
                            openAuditDrawer(auditLog.id);
                          }}
                          type="button"
                        >
                          {auditLog.entityType}
                        </button>
                      </td>
                      <td>
                        <button
                          className="audit-row-button"
                          onClick={() => {
                            openAuditDrawer(auditLog.id);
                          }}
                          type="button"
                        >
                          {renderAuditValue(
                            auditLog.projectId,
                            t("app.audit.emptyValue"),
                          )}
                        </button>
                      </td>
                      <td className="audit-message-cell">
                        <button
                          className="audit-row-button"
                          onClick={() => {
                            openAuditDrawer(auditLog.id);
                          }}
                          type="button"
                        >
                          {renderAuditValue(
                            auditLog.message,
                            t("app.audit.emptyValue"),
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {auditLogList.totalPages > 1 ? (
              <div className="audit-pagination">
                <p className="field-hint">
                  {t("app.audit.pagination.rangeLabel")}: {visibleRangeStart}-
                  {visibleRangeEnd} / {auditLogList.total}
                </p>

                <div className="audit-pagination-controls">
                  <button
                    className="secondary-button"
                    disabled={isAuditLoading || auditLogList.page <= 1}
                    onClick={() => {
                      goToPage(auditLogList.page - 1);
                    }}
                    type="button"
                  >
                    {t("app.audit.pagination.previous")}
                  </button>

                  {pageNumbers.map((pageNumber) => {
                    const isCurrentPage = pageNumber === auditLogList.page;

                    return (
                      <button
                        aria-current={isCurrentPage ? "page" : undefined}
                        className="secondary-button"
                        disabled={isAuditLoading || isCurrentPage}
                        key={pageNumber}
                        onClick={() => {
                          goToPage(pageNumber);
                        }}
                        type="button"
                      >
                        {pageNumber}
                      </button>
                    );
                  })}

                  <button
                    className="secondary-button"
                    disabled={
                      isAuditLoading ||
                      auditLogList.page >= auditLogList.totalPages
                    }
                    onClick={() => {
                      goToPage(auditLogList.page + 1);
                    }}
                    type="button"
                  >
                    {t("app.audit.pagination.next")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </article>

      {selectedAuditLog ? (
        <aside className="panel audit-detail-panel">
          <div className="panel-header">
            <div>
              <p className="panel-eyebrow">{t("app.audit.eyebrow")}</p>
              <h2>{t("app.audit.drawer.title")}</h2>
            </div>
            <button
              className="secondary-button audit-detail-close-button"
              onClick={closeAuditDrawer}
              type="button"
            >
              {t("app.audit.drawer.close")}
            </button>
          </div>

          <p className="panel-summary">{t("app.audit.drawer.summary")}</p>

          <div className="audit-detail-list">
            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.columns.timestamp")}
              </span>
              <strong className="audit-detail-value">
                {formatAuditTimestamp({
                  locale,
                  value: selectedAuditLog.createdAt,
                })}
              </strong>
            </div>

            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.columns.action")}
              </span>
              <strong className="audit-detail-value">
                {selectedAuditLog.action}
              </strong>
            </div>

            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.columns.entityType")}
              </span>
              <strong className="audit-detail-value">
                {selectedAuditLog.entityType}
              </strong>
            </div>

            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.drawer.fields.entityId")}
              </span>
              <strong className="audit-detail-value">
                {renderAuditValue(
                  selectedAuditLog.entityId,
                  t("app.audit.emptyValue"),
                )}
              </strong>
            </div>

            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.columns.project")}
              </span>
              <strong className="audit-detail-value">
                {renderAuditValue(
                  selectedAuditLog.projectId,
                  t("app.audit.emptyValue"),
                )}
              </strong>
            </div>

            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.drawer.fields.userId")}
              </span>
              <strong className="audit-detail-value">
                {renderAuditValue(
                  selectedAuditLog.userId,
                  t("app.audit.emptyValue"),
                )}
              </strong>
            </div>

            <div className="audit-detail-item">
              <span className="audit-detail-label">
                {t("app.audit.columns.message")}
              </span>
              <strong className="audit-detail-value audit-detail-value-multiline">
                {renderAuditValue(
                  selectedAuditLog.message,
                  t("app.audit.emptyValue"),
                )}
              </strong>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
};
