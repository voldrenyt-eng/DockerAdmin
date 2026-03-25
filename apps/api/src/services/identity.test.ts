import assert from "node:assert/strict";
import test from "node:test";

import { createServiceId, parseServiceId } from "./identity.js";

test("createServiceId creates an opaque identifier that round-trips through parseServiceId", () => {
  const serviceId = createServiceId({
    projectId: "project_1",
    serviceName: "api",
  });

  assert.notEqual(serviceId, "project_1:api");
  assert.deepEqual(parseServiceId(serviceId), {
    projectId: "project_1",
    serviceName: "api",
  });
});

test("parseServiceId returns null for malformed input", () => {
  assert.equal(parseServiceId(""), null);
  assert.equal(parseServiceId("%%%"), null);
  assert.equal(
    parseServiceId(
      Buffer.from(JSON.stringify({ projectId: "project_1" })).toString(
        "base64url",
      ),
    ),
    null,
  );
});
