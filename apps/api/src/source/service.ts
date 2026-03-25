import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, posix, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import * as yauzl from "yauzl";

import type { ProjectSourceGitRequestDto } from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { AppError, appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import type { RuntimePaths } from "../runtime/paths.js";

const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];

const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_DIRECTORY_MODE = 0o040000;
const UNIX_REGULAR_FILE_MODE = 0o100000;

export const ZIP_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ZIP_MAX_EXTRACTED_BYTES = 64 * 1024 * 1024;
export const ZIP_INVALID_ARCHIVE_MESSAGE =
  "ZIP archive is not a valid ZIP file";
export const ZIP_UNSAFE_PATH_MESSAGE = "ZIP archive contains an unsafe path";
export const ZIP_BLOCKED_FILE_TYPE_MESSAGE =
  "ZIP archive contains a blocked file type";
export const ZIP_EXTRACTED_SIZE_MESSAGE =
  "ZIP archive exceeds the maximum extracted size";
export const ZIP_UPLOAD_SIZE_MESSAGE =
  "ZIP archive exceeds the maximum upload size";
export const GIT_CLONE_TIMEOUT_MS = 30_000;
export const GIT_CLONE_TIMEOUT_MESSAGE = "Git clone timed out";
export const GIT_CLONE_FAILED_PREFIX = "Git clone failed";
export const GIT_RUNTIME_UNAVAILABLE_MESSAGE =
  "Git clone failed: git is not available in the API runtime";

type SourceServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  gitCloneTimeoutMs?: number;
  maxExtractedBytes?: number;
  maxUploadBytes?: number;
  projectRepository: Pick<ProjectRepository, "findProjectById">;
  runGitClone?: GitCloneRunner;
  runtimePaths: Pick<RuntimePaths, "ensureProjectRuntimeLayout">;
};

export type SourceService = {
  cloneGitSource: (
    input: ProjectSourceGitRequestDto & {
      projectId: string;
      userId?: string | null;
    },
  ) => Promise<void>;
  maxUploadBytes: number;
  uploadZipSource: (input: {
    archive: Buffer;
    projectId: string;
    userId?: string | null;
  }) => Promise<void>;
};

type GitCloneRequest = ProjectSourceGitRequestDto & {
  destinationDir: string;
  timeoutMs: number;
};

type GitCloneRunner = (input: GitCloneRequest) => Promise<void>;

type ZipEntryKind = "directory" | "file" | "blocked";

const execFileAsync = promisify(execFile);

const hasZipSignature = (archive: Buffer): boolean => {
  return ZIP_SIGNATURES.some((signature) => {
    return archive.subarray(0, signature.length).equals(signature);
  });
};

const resolveWithinRoot = (root: string, relativePath: string): string => {
  const normalizedRoot = resolve(root);
  const candidate = resolve(root, relativePath);

  if (
    candidate !== normalizedRoot &&
    !candidate.startsWith(`${normalizedRoot}${sep}`)
  ) {
    throw appErrors.validation(ZIP_UNSAFE_PATH_MESSAGE);
  }

  return candidate;
};

const normalizeZipEntryPath = (entryPath: string): string => {
  if (entryPath.length === 0 || entryPath.includes("\\")) {
    throw appErrors.validation(ZIP_UNSAFE_PATH_MESSAGE);
  }

  if (entryPath.startsWith("/") || /^[a-zA-Z]:/.test(entryPath)) {
    throw appErrors.validation(ZIP_UNSAFE_PATH_MESSAGE);
  }

  const normalizedPath = posix.normalize(entryPath);
  const trimmedPath = normalizedPath.replace(/\/+$/u, "");

  if (
    normalizedPath === "." ||
    trimmedPath.length === 0 ||
    trimmedPath === ".." ||
    trimmedPath.startsWith("../") ||
    trimmedPath.includes("/../")
  ) {
    throw appErrors.validation(ZIP_UNSAFE_PATH_MESSAGE);
  }

  return trimmedPath;
};

const getZipEntryKind = (entry: yauzl.Entry): ZipEntryKind => {
  if (entry.fileName.endsWith("/")) {
    return "directory";
  }

  const unixMode = entry.externalFileAttributes >>> 16;
  const unixFileType = unixMode & UNIX_FILE_TYPE_MASK;

  if (unixFileType === 0 || unixFileType === UNIX_REGULAR_FILE_MODE) {
    return "file";
  }

  if (unixFileType === UNIX_DIRECTORY_MODE) {
    return "directory";
  }

  return "blocked";
};

const toZipValidationError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();

    if (
      normalizedMessage.includes("invalid relative path") ||
      normalizedMessage.includes("absolute path")
    ) {
      return appErrors.validation(ZIP_UNSAFE_PATH_MESSAGE);
    }
  }

  return appErrors.validation(ZIP_INVALID_ARCHIVE_MESSAGE);
};

const openZipFromBuffer = async (archive: Buffer): Promise<yauzl.ZipFile> => {
  return await new Promise((resolvePromise, rejectPromise) => {
    yauzl.fromBuffer(
      archive,
      {
        lazyEntries: true,
        validateEntrySizes: true,
      },
      (error, zipFile) => {
        if (error || !zipFile) {
          rejectPromise(toZipValidationError(error));
          return;
        }

        resolvePromise(zipFile);
      },
    );
  });
};

const openEntryReadStream = async (
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<NodeJS.ReadableStream> => {
  return await new Promise((resolvePromise, rejectPromise) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        rejectPromise(toZipValidationError(error));
        return;
      }

      resolvePromise(stream);
    });
  });
};

const extractZipArchive = async (input: {
  archive: Buffer;
  destinationRoot: string;
  maxExtractedBytes: number;
}): Promise<void> => {
  const zipFile = await openZipFromBuffer(input.archive);

  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let extractedBytes = 0;
      let completed = false;

      const finishWithError = (error: unknown) => {
        if (completed) {
          return;
        }

        completed = true;
        zipFile.close();
        rejectPromise(error);
      };

      zipFile.on("error", (error) => {
        finishWithError(toZipValidationError(error));
      });

      zipFile.on("end", () => {
        if (completed) {
          return;
        }

        completed = true;
        resolvePromise();
      });

      zipFile.on("entry", async (entry) => {
        try {
          const entryKind = getZipEntryKind(entry);

          if (entryKind === "blocked") {
            finishWithError(
              appErrors.validation(ZIP_BLOCKED_FILE_TYPE_MESSAGE),
            );
            return;
          }

          extractedBytes += entry.uncompressedSize;

          if (extractedBytes > input.maxExtractedBytes) {
            finishWithError(appErrors.validation(ZIP_EXTRACTED_SIZE_MESSAGE));
            return;
          }

          const relativePath = normalizeZipEntryPath(entry.fileName);
          const destinationPath = resolveWithinRoot(
            input.destinationRoot,
            relativePath,
          );

          if (entryKind === "directory") {
            await mkdir(destinationPath, { recursive: true });
            zipFile.readEntry();
            return;
          }

          await mkdir(dirname(destinationPath), { recursive: true });
          const inputStream = await openEntryReadStream(zipFile, entry);

          await pipeline(
            inputStream,
            createWriteStream(destinationPath, {
              flags: "wx",
            }),
          );

          zipFile.readEntry();
        } catch (error) {
          finishWithError(error);
        }
      });

      zipFile.readEntry();
    });
  } finally {
    zipFile.close();
  }
};

const buildGitCloneArgs = ({
  branch,
  destinationDir,
  url,
}: GitCloneRequest): string[] => {
  const args = ["-c", "submodule.recurse=false", "clone", "--depth", "1"];

  if (branch) {
    args.push("--branch", branch, "--single-branch");
  }

  args.push(url, destinationDir);

  return args;
};

const toGitCloneError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    if ("code" in error && error.code === "ENOENT") {
      return appErrors.validation(GIT_RUNTIME_UNAVAILABLE_MESSAGE);
    }

    if (
      ("code" in error && error.code === "ETIMEDOUT") ||
      ("signal" in error && error.signal === "SIGTERM")
    ) {
      return appErrors.validation(GIT_CLONE_TIMEOUT_MESSAGE);
    }

    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const message =
      stderr
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .at(-1) ?? error.message;

    return appErrors.validation(`${GIT_CLONE_FAILED_PREFIX}: ${message}`);
  }

  return appErrors.validation(`${GIT_CLONE_FAILED_PREFIX}: Unknown git error`);
};

const runGitCloneCommand: GitCloneRunner = async (input) => {
  try {
    await execFileAsync("git", buildGitCloneArgs(input), {
      timeout: input.timeoutMs,
    });
  } catch (error) {
    throw toGitCloneError(error);
  }
};

const writeAuditLogBestEffort = async (input: {
  auditLogRepository: AuditLogRepository | undefined;
  record: Parameters<AuditLogRepository["createAuditLog"]>[0];
}): Promise<void> => {
  if (!input.auditLogRepository) {
    return;
  }

  try {
    await input.auditLogRepository.createAuditLog(input.record);
  } catch {
    // Audit persistence must never change the source outcome.
  }
};

const replaceWorkspaceFromStagedDir = async (input: {
  backupPrefix: string;
  projectRoot: string;
  stagedDir: string;
  targetDir: string;
}): Promise<void> => {
  const backupDir = await mkdtemp(join(input.projectRoot, input.backupPrefix));
  await rm(backupDir, { force: true, recursive: true });

  let targetMovedToBackup = false;
  let targetPromoted = false;

  try {
    await rename(input.targetDir, backupDir);
    targetMovedToBackup = true;

    await rename(input.stagedDir, input.targetDir);
    targetPromoted = true;
  } catch (error) {
    if (targetMovedToBackup && !targetPromoted) {
      await rm(input.targetDir, { force: true, recursive: true });
      await rename(backupDir, input.targetDir);
      targetMovedToBackup = false;
    }

    throw error;
  } finally {
    if (targetPromoted) {
      await rm(backupDir, { force: true, recursive: true });
    }

    await rm(input.stagedDir, { force: true, recursive: true });
  }
};

export const createSourceService = ({
  auditLogRepository,
  gitCloneTimeoutMs = GIT_CLONE_TIMEOUT_MS,
  maxExtractedBytes = ZIP_MAX_EXTRACTED_BYTES,
  maxUploadBytes = ZIP_MAX_UPLOAD_BYTES,
  projectRepository,
  runGitClone = runGitCloneCommand,
  runtimePaths,
}: SourceServiceOptions): SourceService => ({
  async cloneGitSource({ branch, projectId, url, userId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const layout = await runtimePaths.ensureProjectRuntimeLayout(projectId);
    const stagedDir = await mkdtemp(join(layout.projectRoot, ".repo-clone-"));

    try {
      await runGitClone({
        ...(branch === undefined ? {} : { branch }),
        destinationDir: stagedDir,
        timeoutMs: gitCloneTimeoutMs,
        url,
      });
      await replaceWorkspaceFromStagedDir({
        backupPrefix: ".repo-previous-",
        projectRoot: layout.projectRoot,
        stagedDir,
        targetDir: layout.repoDir,
      });
      await writeAuditLogBestEffort({
        auditLogRepository,
        record: {
          action: "SOURCE_CLONE",
          entityId: projectId,
          entityType: "project",
          message: "Git source cloned",
          projectId,
          userId: userId ?? null,
        },
      });
    } finally {
      await rm(stagedDir, { force: true, recursive: true });
    }
  },
  maxUploadBytes,
  async uploadZipSource({ archive, projectId, userId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    if (!hasZipSignature(archive)) {
      throw appErrors.validation(ZIP_INVALID_ARCHIVE_MESSAGE);
    }

    const layout = await runtimePaths.ensureProjectRuntimeLayout(projectId);
    const stagedDir = await mkdtemp(join(layout.projectRoot, ".src-upload-"));

    try {
      await extractZipArchive({
        archive,
        destinationRoot: stagedDir,
        maxExtractedBytes,
      });
      await replaceWorkspaceFromStagedDir({
        backupPrefix: ".src-previous-",
        projectRoot: layout.projectRoot,
        stagedDir,
        targetDir: layout.srcDir,
      });
      await writeAuditLogBestEffort({
        auditLogRepository,
        record: {
          action: "SOURCE_UPLOAD",
          entityId: projectId,
          entityType: "project",
          message: "ZIP source uploaded",
          projectId,
          userId: userId ?? null,
        },
      });
    } finally {
      await rm(stagedDir, { force: true, recursive: true });
    }
  },
});
