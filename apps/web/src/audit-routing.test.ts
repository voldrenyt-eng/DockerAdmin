import assert from "node:assert/strict";
import test from "node:test";

import { auditRoutePath } from "./audit-routing.js";

test("auditRoutePath exposes the protected top-level audit route", () => {
  assert.equal(auditRoutePath, "/audit");
});
