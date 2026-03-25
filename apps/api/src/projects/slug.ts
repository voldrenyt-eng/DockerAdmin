export const ProjectSlugPattern = /^[a-z0-9][a-z0-9_-]*$/;

const COMBINING_MARKS_PATTERN = /\p{M}+/gu;
const DISALLOWED_SLUG_CHARS_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASHES_PATTERN = /^-+|-+$/g;
const REPEATED_DASHES_PATTERN = /-+/g;

export const createProjectSlugBase = (name: string): string => {
  const normalizedValue = name
    .normalize("NFKD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .trim();
  const slug = normalizedValue
    .replace(DISALLOWED_SLUG_CHARS_PATTERN, "-")
    .replace(REPEATED_DASHES_PATTERN, "-")
    .replace(EDGE_DASHES_PATTERN, "");

  if (!slug || !ProjectSlugPattern.test(slug)) {
    return "project";
  }

  return slug;
};

export const buildProjectSlugCandidate = (
  slugBase: string,
  attempt: number,
): string => {
  return attempt === 1 ? slugBase : `${slugBase}-${attempt}`;
};

export const generateUniqueProjectSlug = async (
  name: string,
  isSlugTaken: (slug: string) => Promise<boolean>,
): Promise<string> => {
  const slugBase = createProjectSlugBase(name);
  let attempt = 1;

  while (true) {
    const candidateSlug = buildProjectSlugCandidate(slugBase, attempt);

    if (!ProjectSlugPattern.test(candidateSlug)) {
      throw new Error("Generated project slug is not compose-safe");
    }

    if (!(await isSlugTaken(candidateSlug))) {
      return candidateSlug;
    }

    attempt += 1;
  }
};
