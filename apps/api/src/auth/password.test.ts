import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "./password.js";

test("hashPassword returns a scrypt-formatted hash that verifies successfully", async () => {
  const passwordHash = await hashPassword("super-secret-password");

  assert.match(passwordHash, /^scrypt\$/);
  assert.equal(
    await verifyPassword("super-secret-password", passwordHash),
    true,
  );
});

test("verifyPassword rejects a wrong password for a valid scrypt hash", async () => {
  const passwordHash = await hashPassword("super-secret-password");

  assert.equal(await verifyPassword("wrong-password", passwordHash), false);
});

test("verifyPassword rejects malformed hash payloads", async () => {
  assert.equal(
    await verifyPassword("super-secret-password", "bad-format"),
    false,
  );
});
