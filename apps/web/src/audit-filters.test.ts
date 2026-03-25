import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAuditFilterStatePatch,
  buildAuditPageNumbers,
  createAuditFilterSearchParams,
  defaultAuditFilterValue,
  defaultAuditPage,
  defaultAuditPageSize,
  readAuditFilterState,
} from "./audit-filters.js";

test("readAuditFilterState restores search, exact filters, and pagination from URL params", () => {
  const searchParams = new URLSearchParams(
    "q=deploy%20failed&action=DEPLOY_FINISH&entityType=deployment&page=3&pageSize=50",
  );

  assert.deepEqual(readAuditFilterState(searchParams), {
    action: "DEPLOY_FINISH",
    entityType: "deployment",
    page: 3,
    pageSize: 50,
    query: "deploy failed",
  });
});

test("readAuditFilterState falls back to clean defaults when params are absent", () => {
  assert.deepEqual(readAuditFilterState(new URLSearchParams("")), {
    action: defaultAuditFilterValue,
    entityType: defaultAuditFilterValue,
    page: defaultAuditPage,
    pageSize: defaultAuditPageSize,
    query: "",
  });
});

test("createAuditFilterSearchParams omits empty default values from the URL", () => {
  assert.equal(
    createAuditFilterSearchParams({
      action: defaultAuditFilterValue,
      entityType: defaultAuditFilterValue,
      page: defaultAuditPage,
      pageSize: defaultAuditPageSize,
      query: "   ",
    }).toString(),
    "",
  );
});

test("createAuditFilterSearchParams keeps only active non-default values", () => {
  assert.equal(
    createAuditFilterSearchParams({
      action: "SERVICE_ACTION",
      entityType: defaultAuditFilterValue,
      page: 2,
      pageSize: 50,
      query: " restart ",
    }).toString(),
    "q=restart&action=SERVICE_ACTION&page=2&pageSize=50",
  );
});

test("applyAuditFilterStatePatch resets page when dataset-shaping filters change", () => {
  assert.deepEqual(
    applyAuditFilterStatePatch(
      {
        action: defaultAuditFilterValue,
        entityType: defaultAuditFilterValue,
        page: 4,
        pageSize: defaultAuditPageSize,
        query: "",
      },
      {
        query: "restart",
      },
    ),
    {
      action: defaultAuditFilterValue,
      entityType: defaultAuditFilterValue,
      page: 1,
      pageSize: defaultAuditPageSize,
      query: "restart",
    },
  );
});

test("applyAuditFilterStatePatch keeps page when only the page changes", () => {
  assert.deepEqual(
    applyAuditFilterStatePatch(
      {
        action: "SERVICE_ACTION",
        entityType: "service",
        page: 2,
        pageSize: defaultAuditPageSize,
        query: "restart",
      },
      {
        page: 3,
      },
    ),
    {
      action: "SERVICE_ACTION",
      entityType: "service",
      page: 3,
      pageSize: defaultAuditPageSize,
      query: "restart",
    },
  );
});

test("buildAuditPageNumbers returns a centered numbered window", () => {
  assert.deepEqual(
    buildAuditPageNumbers({
      currentPage: 5,
      totalPages: 9,
    }),
    [3, 4, 5, 6, 7],
  );
});
