import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import type { Duplex } from "node:stream";
import test from "node:test";

import { AuthSchema } from "@dockeradmin/shared";

import { hashPassword } from "../auth/password.js";
import { createAuthRepository } from "../auth/repository.js";
import { createAuthService } from "../auth/service.js";
import { appErrors } from "../errors.js";
import { buildApp } from "../server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

type StreamSeed = {
  lines: string[];
  serviceName: string;
  tail: number;
};

type StreamSession = {
  onError: (error: Error) => void;
  onLine: (line: string) => void;
};

const createLogsStreamServiceDouble = () => {
  const snapshotsByKey = new Map<string, StreamSeed>();
  const setupFailuresByKey = new Map<string, Error>();
  const sessionsByKey = new Map<string, StreamSession>();
  const streamCalls: Array<{
    projectId: string;
    serviceName: string;
    tail: number;
  }> = [];
  const stopCalls: string[] = [];

  const toKey = (input: {
    projectId: string;
    serviceName: string;
    tail: number;
  }): string => {
    return `${input.projectId}:${input.serviceName}:${input.tail}`;
  };

  return {
    emitError(input: {
      error: Error;
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      sessionsByKey.get(toKey(input))?.onError(input.error);
    },
    emitLine(input: {
      line: string;
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      sessionsByKey.get(toKey(input))?.onLine(input.line);
    },
    failProjectLogsStream(input: {
      error: Error;
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      setupFailuresByKey.set(toKey(input), input.error);
    },
    async openProjectLogsStream(input: {
      onError: (error: Error) => void;
      onLine: (line: string) => void;
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      streamCalls.push({
        projectId: input.projectId,
        serviceName: input.serviceName,
        tail: input.tail,
      });

      const key = toKey(input);
      const failure = setupFailuresByKey.get(key);

      if (failure) {
        throw failure;
      }

      const snapshot = snapshotsByKey.get(key);

      if (!snapshot) {
        throw appErrors.notFound("Project not found");
      }

      sessionsByKey.set(key, {
        onError: input.onError,
        onLine: input.onLine,
      });

      return {
        snapshot,
        stop() {
          stopCalls.push(key);
          sessionsByKey.delete(key);
        },
      };
    },
    seedProjectLogsStream(input: {
      lines: string[];
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      snapshotsByKey.set(toKey(input), {
        lines: input.lines,
        serviceName: input.serviceName,
        tail: input.tail,
      });
    },
    stopCalls,
    streamCalls,
  };
};

const createTestServer = async () => {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const authRepository = createAuthRepository({
    refreshTokens: [],
    users: [
      {
        email: ADMIN_EMAIL,
        id: "user_admin",
        passwordHash,
        role: "ADMIN",
      },
    ],
  });
  const authService = createAuthService({
    authRepository,
    jwtAccessSecret: "test-access-secret",
    jwtRefreshSecret: "test-refresh-secret",
  });
  const logsStreamService = createLogsStreamServiceDouble();
  const app = buildApp({
    authService,
    logsStreamService,
  } as never);

  await app.listen({
    host: "127.0.0.1",
    port: 0,
  });
  app.server.unref();

  const address = app.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }

  return {
    app,
    logsStreamService,
    port: address.port,
  };
};

const closeTestServer = async (
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
): Promise<void> => {
  app.server.closeAllConnections?.();

  if (app.server.listening) {
    await app.close();
  } else {
    app.server.unref();
  }
};

const waitFor = async (
  condition: () => boolean,
  timeoutMs = 2_000,
): Promise<void> => {
  const startedAt = Date.now();

  while (!condition()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for the expected condition");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    payload: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    url: "/api/auth/login",
  });
  const body = AuthSchema.parse(response.json());

  return body.tokens.accessToken;
};

const encodeWebSocketFrame = (input: {
  masked?: boolean;
  opcode: number;
  payload?: Buffer;
}): Buffer => {
  const payload = input.payload ?? Buffer.alloc(0);
  let headerLength = 2;

  if (payload.length >= 126 && payload.length <= 65535) {
    headerLength += 2;
  } else if (payload.length > 65535) {
    headerLength += 8;
  }

  const maskLength = input.masked ? 4 : 0;
  const frame = Buffer.alloc(headerLength + maskLength + payload.length);
  frame[0] = 0x80 | (input.opcode & 0x0f);

  let offset = 2;

  if (payload.length < 126) {
    frame[1] = payload.length;
  } else if (payload.length <= 65535) {
    frame[1] = 126;
    frame.writeUInt16BE(payload.length, offset);
    offset += 2;
  } else {
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(payload.length), offset);
    offset += 8;
  }

  if (input.masked) {
    const mask = randomBytes(4);
    frame[1] |= 0x80;
    mask.copy(frame, offset);
    offset += 4;

    for (const [index, value] of payload.entries()) {
      frame[offset + index] = value ^ (mask[index % 4] ?? 0);
    }
  } else {
    payload.copy(frame, offset);
  }

  return frame;
};

const createWebSocketMessageReader = (socket: Duplex, initialHead: Buffer) => {
  let buffered = Buffer.from(initialHead);
  let closed = false;
  const queuedFrames: Array<{ opcode: number; payload: Buffer }> = [];
  const waitingReaders: Array<{
    reject: (error: Error) => void;
    resolve: (frame: { opcode: number; payload: Buffer }) => void;
  }> = [];

  const flushFrames = () => {
    while (true) {
      if (buffered.length < 2) {
        return;
      }

      const firstByte = buffered[0];
      const secondByte = buffered[1];

      if (firstByte === undefined || secondByte === undefined) {
        return;
      }

      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffered.length < offset + 2) {
          return;
        }

        payloadLength = buffered.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (buffered.length < offset + 8) {
          return;
        }

        const encodedLength = buffered.readBigUInt64BE(offset);

        if (encodedLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("Frame payload is too large");
        }

        payloadLength = Number(encodedLength);
        offset += 8;
      }

      const maskOffset = masked ? 4 : 0;

      if (buffered.length < offset + maskOffset + payloadLength) {
        return;
      }

      const mask = masked ? buffered.subarray(offset, offset + 4) : null;
      offset += maskOffset;

      const payload = Buffer.from(
        buffered.subarray(offset, offset + payloadLength),
      );
      buffered = Buffer.from(buffered.subarray(offset + payloadLength));

      if (mask) {
        for (const [index, value] of payload.entries()) {
          payload[index] = value ^ (mask[index % 4] ?? 0);
        }
      }

      const nextFrame = {
        opcode,
        payload,
      };
      const waitingReader = waitingReaders.shift();

      if (waitingReader) {
        waitingReader.resolve(nextFrame);
      } else {
        queuedFrames.push(nextFrame);
      }
    }
  };

  socket.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    flushFrames();
  });
  socket.on("close", () => {
    closed = true;

    while (waitingReaders.length > 0) {
      waitingReaders.shift()?.reject(new Error("Socket closed"));
    }
  });

  flushFrames();
  socket.resume();

  return {
    async readJsonMessage(): Promise<unknown> {
      const frame =
        queuedFrames.shift() ??
        (await new Promise<{ opcode: number; payload: Buffer }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Timed out waiting for a WebSocket message"));
            }, 2_000);

            if (closed) {
              clearTimeout(timeout);
              reject(new Error("Socket closed"));

              return;
            }

            waitingReaders.push({
              reject: (error) => {
                clearTimeout(timeout);
                reject(error);
              },
              resolve: (value) => {
                clearTimeout(timeout);
                resolve(value);
              },
            });
          },
        ));

      assert.equal(frame.opcode, 0x1);

      return JSON.parse(frame.payload.toString("utf8"));
    },
  };
};

const openLogsStream = async (input: {
  accessToken?: string;
  port: number;
  projectId: string;
  serviceName?: string;
  tail?: number;
}) => {
  const searchParams = new URLSearchParams();

  searchParams.set("projectId", input.projectId);

  if (input.serviceName) {
    searchParams.set("serviceName", input.serviceName);
  }

  if (typeof input.tail === "number") {
    searchParams.set("tail", String(input.tail));
  }

  if (input.accessToken) {
    searchParams.set("accessToken", input.accessToken);
  }

  return await new Promise<
    | {
        reader: ReturnType<typeof createWebSocketMessageReader>;
        response: http.IncomingMessage;
        socket: Duplex;
        type: "upgrade";
      }
    | {
        body: unknown;
        response: http.IncomingMessage;
        type: "response";
      }
  >((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for the WebSocket upgrade"));
    }, 2_000);
    const request = http.request({
      headers: {
        Connection: "Upgrade",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        "Sec-WebSocket-Version": "13",
        Upgrade: "websocket",
      },
      host: "127.0.0.1",
      method: "GET",
      path: `/api/ws/logs?${searchParams.toString()}`,
      port: input.port,
    });

    request.on("error", reject);
    request.on("response", (response) => {
      const bodyChunks: Buffer[] = [];

      response.on("data", (chunk) => {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        clearTimeout(timeout);
        const rawBody = Buffer.concat(bodyChunks).toString("utf8");

        resolve({
          body: rawBody.length > 0 ? JSON.parse(rawBody) : null,
          response,
          type: "response",
        });
      });
    });
    request.on("upgrade", (response, socket, head) => {
      clearTimeout(timeout);
      resolve({
        reader: createWebSocketMessageReader(socket, head),
        response,
        socket,
        type: "upgrade",
      });
    });

    request.end();
  });
};

test("WS /api/ws/logs upgrades for an authenticated admin, sends the initial snapshot, follows new lines, and stops on disconnect", async () => {
  const { app, logsStreamService, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    logsStreamService.seedProjectLogsStream({
      lines: ["demo-api-1  | ready"],
      projectId: "project_1",
      serviceName: "api",
      tail: 50,
    });

    const accessToken = await loginAsAdmin(app);
    connection = await openLogsStream({
      accessToken,
      port,
      projectId: "project_1",
      serviceName: "api",
      tail: 50,
    });
    assert.equal(connection.type, "upgrade");
    assert.equal(connection.response.statusCode, 101);
    assert.deepEqual(logsStreamService.streamCalls, [
      {
        projectId: "project_1",
        serviceName: "api",
        tail: 50,
      },
    ]);
    assert.deepEqual(await connection.reader.readJsonMessage(), {
      lines: ["demo-api-1  | ready"],
      serviceName: "api",
      tail: 50,
      type: "snapshot",
    });

    logsStreamService.emitLine({
      line: "demo-api-1  | serving",
      projectId: "project_1",
      serviceName: "api",
      tail: 50,
    });

    assert.deepEqual(await connection.reader.readJsonMessage(), {
      line: "demo-api-1  | serving",
      serviceName: "api",
      type: "line",
    });

    const closePromise = once(connection.socket, "close");

    connection.socket.destroy();
    await closePromise;
    await waitFor(() => {
      return logsStreamService.stopCalls.length === 1;
    });

    assert.deepEqual(logsStreamService.stopCalls, ["project_1:api:50"]);
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});

test("WS /api/ws/logs returns a standardized 401 response when the access token is missing", async () => {
  const { app, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    connection = await openLogsStream({
      port,
      projectId: "project_1",
      serviceName: "api",
      tail: 50,
    });

    assert.equal(connection.type, "response");
    assert.equal(connection.response.statusCode, 401);
    assert.deepEqual(connection.body, {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});

test("WS /api/ws/logs returns a standardized 401 response when the access token is invalid", async () => {
  const { app, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    connection = await openLogsStream({
      accessToken: "not-a-valid-access-token",
      port,
      projectId: "project_1",
      serviceName: "api",
      tail: 50,
    });

    assert.equal(connection.type, "response");
    assert.equal(connection.response.statusCode, 401);
    assert.deepEqual(connection.body, {
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired access token",
      },
    });
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});

test("WS /api/ws/logs returns a standardized 422 response when serviceName is missing", async () => {
  const { app, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    const accessToken = await loginAsAdmin(app);
    connection = await openLogsStream({
      accessToken,
      port,
      projectId: "project_1",
      tail: 50,
    });

    assert.equal(connection.type, "response");
    assert.equal(connection.response.statusCode, 422);
    assert.deepEqual(connection.body, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request payload does not match the shared DTO contract",
      },
    });
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});

test("WS /api/ws/logs sends a safe overload error and closes the socket when too many log lines arrive in one burst", async () => {
  const { app, logsStreamService, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    logsStreamService.seedProjectLogsStream({
      lines: ["demo-api-1  | ready"],
      projectId: "project_1",
      serviceName: "api",
      tail: 100,
    });

    const accessToken = await loginAsAdmin(app);
    connection = await openLogsStream({
      accessToken,
      port,
      projectId: "project_1",
      serviceName: "api",
      tail: 100,
    });

    assert.equal(connection.type, "upgrade");
    assert.deepEqual(await connection.reader.readJsonMessage(), {
      lines: ["demo-api-1  | ready"],
      serviceName: "api",
      tail: 100,
      type: "snapshot",
    });

    for (let index = 0; index < 2_000; index += 1) {
      logsStreamService.emitLine({
        line: `demo-api-1  | ${"x".repeat(256)}:${index}`,
        projectId: "project_1",
        serviceName: "api",
        tail: 100,
      });
    }

    const closePromise = once(connection.socket, "close");

    assert.deepEqual(await connection.reader.readJsonMessage(), {
      message: "Log stream overloaded",
      type: "error",
    });
    await closePromise;
    await waitFor(() => {
      return logsStreamService.stopCalls.length === 1;
    });
    assert.deepEqual(logsStreamService.stopCalls, ["project_1:api:100"]);
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});

test("WS /api/ws/logs sends a safe error frame and closes the socket when the live follow fails after the upgrade", async () => {
  const { app, logsStreamService, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    logsStreamService.seedProjectLogsStream({
      lines: ["demo-api-1  | ready"],
      projectId: "project_1",
      serviceName: "api",
      tail: 25,
    });

    const accessToken = await loginAsAdmin(app);
    connection = await openLogsStream({
      accessToken,
      port,
      projectId: "project_1",
      serviceName: "api",
      tail: 25,
    });

    assert.equal(connection.type, "upgrade");
    await connection.reader.readJsonMessage();

    logsStreamService.emitError({
      error: new Error("docker compose follow leaked internals"),
      projectId: "project_1",
      serviceName: "api",
      tail: 25,
    });

    const closePromise = once(connection.socket, "close");

    assert.deepEqual(await connection.reader.readJsonMessage(), {
      message: "Log stream failed",
      type: "error",
    });
    await closePromise;
    await waitFor(() => {
      return logsStreamService.stopCalls.length === 1;
    });
    assert.deepEqual(logsStreamService.stopCalls, ["project_1:api:25"]);
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});

test("WS /api/ws/logs stops the live follower when the app shuts down with an active stream", async () => {
  const { app, logsStreamService, port } = await createTestServer();
  let connection: Awaited<ReturnType<typeof openLogsStream>> | null = null;

  try {
    logsStreamService.seedProjectLogsStream({
      lines: ["demo-api-1  | ready"],
      projectId: "project_1",
      serviceName: "api",
      tail: 10,
    });

    const accessToken = await loginAsAdmin(app);
    connection = await openLogsStream({
      accessToken,
      port,
      projectId: "project_1",
      serviceName: "api",
      tail: 10,
    });

    assert.equal(connection.type, "upgrade");
    await connection.reader.readJsonMessage();

    const closePromise = once(connection.socket, "close");

    await app.close();
    await closePromise;
    await waitFor(() => {
      return logsStreamService.stopCalls.length === 1;
    });
    assert.deepEqual(logsStreamService.stopCalls, ["project_1:api:10"]);
  } finally {
    if (
      connection &&
      connection.type === "upgrade" &&
      !connection.socket.destroyed
    ) {
      connection.socket.destroy();
    }

    await closeTestServer(app);
  }
});
