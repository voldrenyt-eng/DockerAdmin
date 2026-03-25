import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDeployCommandRunner } from "./runner.js";

test("createDeployCommandRunner terminates a timed-out process and preserves partial output", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "dockeradmin-deploy-runner-"));
  const fakeDockerPath = join(binDir, "docker");

  writeFileSync(
    fakeDockerPath,
    [
      "#!/bin/sh",
      "printf 'partial stdout\\n'",
      "printf 'partial stderr\\n' >&2",
      "trap '' TERM",
      "while true; do",
      "  sleep 1",
      "done",
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(fakeDockerPath, 0o755);

  try {
    const runner = createDeployCommandRunner({
      killGraceMs: 50,
    });
    const startedAt = Date.now();
    const result = await runner({
      args: ["compose", "up"],
      cwd: binDir,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
      projectSlug: "runner-timeout-test",
      timeoutMs: 100,
    });
    const durationMs = Date.now() - startedAt;

    assert.equal(result.exitCode, 1);
    assert.equal(result.timedOut, true);
    assert.equal(result.stdout.includes("partial stdout"), true);
    assert.equal(result.stderr.includes("partial stderr"), true);
    assert.equal(result.stderr.includes("Deploy timed out after 100ms"), true);
    assert.equal(durationMs < 5000, true);
  } finally {
    rmSync(binDir, { force: true, recursive: true });
  }
});
