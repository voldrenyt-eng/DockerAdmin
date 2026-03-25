import assert from "node:assert/strict";
import test from "node:test";

test("createProjectSlugBase normalizes accents and punctuation into a compose-safe slug", async () => {
  const { createProjectSlugBase, ProjectSlugPattern } = await import(
    "./slug.js"
  );

  const slug = createProjectSlugBase("  Crème brûlée !!! project  ");

  assert.equal(slug, "creme-brulee-project");
  assert.ok(ProjectSlugPattern.test(slug));
});

test("createProjectSlugBase falls back to project when no compose-safe characters remain", async () => {
  const { createProjectSlugBase, ProjectSlugPattern } = await import(
    "./slug.js"
  );

  const slug = createProjectSlugBase("Привіт !!!");

  assert.equal(slug, "project");
  assert.ok(ProjectSlugPattern.test(slug));
});

test("generateUniqueProjectSlug appends numeric suffixes while staying compose-safe", async () => {
  const { generateUniqueProjectSlug, ProjectSlugPattern } = await import(
    "./slug.js"
  );

  const takenSlugs = new Set(["demo-project", "demo-project-2"]);
  const slug = await generateUniqueProjectSlug("Demo Project", async (value) =>
    takenSlugs.has(value),
  );

  assert.equal(slug, "demo-project-3");
  assert.ok(ProjectSlugPattern.test(slug));
});
