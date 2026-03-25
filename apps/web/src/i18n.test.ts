import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultLocale,
  getTranslation,
  readStoredLocale,
  resolveLocale,
  storageLocaleKey,
  supportedLocales,
} from "./i18n.js";

test("resolveLocale accepts supported locales and falls back to english", () => {
  assert.deepEqual(supportedLocales, ["en", "uk", "ru"]);
  assert.equal(defaultLocale, "en");
  assert.equal(resolveLocale("uk"), "uk");
  assert.equal(resolveLocale("ru"), "ru");
  assert.equal(resolveLocale("ua"), "en");
  assert.equal(resolveLocale(undefined), "en");
});

test("getTranslation reads modular translations for each locale", () => {
  assert.equal(
    getTranslation("en", "app.hero.title"),
    "Runtime control center",
  );
  assert.equal(getTranslation("en", "app.auth.title"), "Admin login");
  assert.equal(getTranslation("en", "app.metrics.title"), "Live metrics");
  assert.equal(
    getTranslation("en", "app.projects.pageTitle"),
    "Projects workspace",
  );
  assert.equal(
    getTranslation("en", "app.projects.detail.pageTitle"),
    "Project detail",
  );
  assert.equal(
    getTranslation("en", "app.projects.detail.envEditor.saveIdle"),
    "Save env",
  );
  assert.equal(
    getTranslation("en", "app.projects.detail.deploymentsPanel.deployIdle"),
    "Deploy",
  );
  assert.equal(
    getTranslation("en", "app.projects.detail.servicesPanel.serviceLabel"),
    "Service",
  );
  assert.equal(
    getTranslation("en", "app.projects.detail.domainsPanel.submitIdle"),
    "Create domain",
  );
  assert.equal(getTranslation("en", "app.nav.audit"), "Audit");
  assert.equal(getTranslation("en", "app.audit.pageTitle"), "Audit trail");
  assert.equal(
    getTranslation("en", "app.audit.filters.searchLabel"),
    "Search records",
  );
  assert.equal(
    getTranslation("en", "app.audit.filters.actionAll"),
    "All actions",
  );
  assert.equal(
    getTranslation("en", "app.audit.filteredEmpty"),
    "No audit records match the current filters.",
  );
  assert.equal(
    getTranslation("en", "app.audit.pagination.previous"),
    "Previous",
  );
  assert.equal(getTranslation("en", "app.audit.pagination.next"), "Next");
  assert.equal(
    getTranslation("en", "app.audit.pagination.rangeLabel"),
    "Visible rows",
  );
  assert.equal(getTranslation("en", "app.audit.export.action"), "Export CSV");
  assert.equal(
    getTranslation("en", "app.audit.export.loading"),
    "Exporting CSV...",
  );
  assert.equal(
    getTranslation("en", "app.audit.errors.exportFallback"),
    "Failed to export audit log",
  );
  assert.equal(getTranslation("en", "app.audit.drawer.title"), "Record detail");
  assert.equal(getTranslation("en", "app.audit.drawer.close"), "Close");
  assert.equal(
    getTranslation("uk", "settings.language.title"),
    "Мова інтерфейсу",
  );
  assert.equal(
    getTranslation("uk", "app.kpis.memory.label"),
    "Використання пам'яті",
  );
  assert.equal(getTranslation("ru", "app.nav.dashboard"), "Dashboard");
  assert.equal(getTranslation("ru", "common.locales.uk"), "Украинский");
});

test("readStoredLocale restores a supported locale and falls back for invalid values", () => {
  const validStorage = {
    getItem: (key: string) => {
      assert.equal(key, storageLocaleKey);
      return "ru";
    },
  };
  const invalidStorage = {
    getItem: () => "de",
  };

  assert.equal(readStoredLocale(validStorage), "ru");
  assert.equal(readStoredLocale(invalidStorage), "en");
});
