import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import type {
  ProjectEnvResponseDto,
  ProjectEnvUpsertRequestDto,
} from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { AppError, appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import type { RuntimePaths } from "../runtime/paths.js";

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ENV_INVALID_FORMAT_MESSAGE =
  "Environment content must use KEY=VALUE lines";
export const ENV_NOT_FOUND_MESSAGE = "Project env file not found";
export const ENV_DECRYPT_FAILED_MESSAGE =
  "Encrypted project env payload is unreadable";

const encryptedEnvEnvelopeSchema = z.object({
  algorithm: z.literal("aes-256-gcm"),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  version: z.literal(1),
});

type EncryptedEnvEnvelope = z.infer<typeof encryptedEnvEnvelopeSchema>;

type EnvServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  envEncryptionKey: string;
  projectRepository: Pick<ProjectRepository, "findProjectById">;
  runtimePaths: Pick<
    RuntimePaths,
    "ensureProjectRuntimeLayout" | "getProjectEnvFile"
  >;
};

export type EnvService = {
  getProjectEnv: (input: {
    projectId: string;
  }) => Promise<ProjectEnvResponseDto>;
  putProjectEnv: (
    input: ProjectEnvUpsertRequestDto & {
      projectId: string;
      userId?: string | null;
    },
  ) => Promise<void>;
};

const deriveEncryptionKey = (input: string): Buffer => {
  return createHash("sha256").update(input).digest();
};

const validateEnvContent = (content: string): void => {
  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      throw appErrors.validation(ENV_INVALID_FORMAT_MESSAGE);
    }

    const key = line.slice(0, separatorIndex);

    if (!ENV_KEY_PATTERN.test(key)) {
      throw appErrors.validation(ENV_INVALID_FORMAT_MESSAGE);
    }
  }
};

const normalizeDecryptError = (error: unknown): Error => {
  if (error instanceof Error && error.message === ENV_DECRYPT_FAILED_MESSAGE) {
    return error;
  }

  return new Error(ENV_DECRYPT_FAILED_MESSAGE);
};

export const encryptEnvContent = (input: {
  content: string;
  envEncryptionKey: string;
}): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(input.envEncryptionKey),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(input.content, "utf8"),
    cipher.final(),
  ]);
  const payload = {
    algorithm: "aes-256-gcm",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    version: 1,
  } satisfies EncryptedEnvEnvelope;

  return JSON.stringify(payload);
};

export const decryptEnvContent = (input: {
  encryptedContent: string;
  envEncryptionKey: string;
}): string => {
  try {
    const envelope = encryptedEnvEnvelopeSchema.parse(
      JSON.parse(input.encryptedContent),
    );
    const decipher = createDecipheriv(
      envelope.algorithm,
      deriveEncryptionKey(input.envEncryptionKey),
      Buffer.from(envelope.iv, "base64"),
    );

    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw normalizeDecryptError(error);
  }
};

export const createEnvService = ({
  auditLogRepository,
  envEncryptionKey,
  projectRepository,
  runtimePaths,
}: EnvServiceOptions): EnvService => ({
  async getProjectEnv({ projectId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    try {
      const encryptedContent = await readFile(
        runtimePaths.getProjectEnvFile(projectId),
        "utf8",
      );

      return {
        content: decryptEnvContent({
          encryptedContent,
          envEncryptionKey,
        }),
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw appErrors.notFound(ENV_NOT_FOUND_MESSAGE);
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw normalizeDecryptError(error);
    }
  },
  async putProjectEnv({ content, projectId, userId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    validateEnvContent(content);

    const layout = await runtimePaths.ensureProjectRuntimeLayout(projectId);

    await writeFile(
      layout.envFile,
      encryptEnvContent({
        content,
        envEncryptionKey,
      }),
      "utf8",
    );

    if (!auditLogRepository) {
      return;
    }

    try {
      await auditLogRepository.createAuditLog({
        action: "ENV_UPDATE",
        entityId: projectId,
        entityType: "project",
        message: "Project env updated",
        projectId,
        userId: userId ?? null,
      });
    } catch {
      // Audit persistence must never change the env update outcome.
    }
  },
});
