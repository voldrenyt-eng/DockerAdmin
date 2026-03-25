import { createHash } from "node:crypto";
import { type IncomingMessage, STATUS_CODES } from "node:http";
import type { Duplex } from "node:stream";

import {
  ProjectLogsStreamErrorSchema,
  ProjectLogsStreamLineSchema,
  ProjectLogsStreamSnapshotSchema,
} from "@dockeradmin/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/service.js";
import {
  INTERNAL_ERROR_MESSAGE,
  VALIDATION_ERROR_MESSAGE,
  appErrors,
  toApiErrorResponse,
} from "../errors.js";
import type { LogsStreamService } from "./service.js";

const WEB_SOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const PROJECT_LOGS_STREAM_ERROR_MESSAGE = "Log stream failed";
const PROJECT_LOGS_STREAM_OVERLOAD_ERROR_MESSAGE = "Log stream overloaded";
const PROJECT_LOGS_STREAM_MAX_PENDING_BYTES = 256 * 1024;

const ProjectLogsStreamQuerySchema = z.object({
  accessToken: z.string().min(1).optional(),
  projectId: z.string().min(1),
  serviceName: z.string().min(1),
  tail: z.coerce.number().int().positive().max(1000).default(200),
});

type ParsedWebSocketFrame = {
  consumedBytes: number;
  opcode: number;
  payload: Buffer;
};

const createSecWebSocketAccept = (key: string): string => {
  return createHash("sha1")
    .update(`${key}${WEB_SOCKET_ACCEPT_GUID}`)
    .digest("base64");
};

const encodeWebSocketFrame = (input: {
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

  const frame = Buffer.alloc(headerLength + payload.length);
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

  payload.copy(frame, offset);

  return frame;
};

const tryParseWebSocketFrame = (
  buffer: Buffer,
): ParsedWebSocketFrame | null => {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  if (firstByte === undefined || secondByte === undefined) {
    return null;
  }

  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }

    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }

    const encodedLength = buffer.readBigUInt64BE(offset);

    if (encodedLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }

    payloadLength = Number(encodedLength);
    offset += 8;
  }

  const maskOffset = masked ? 4 : 0;

  if (buffer.length < offset + maskOffset + payloadLength) {
    return null;
  }

  const mask = masked ? buffer.subarray(offset, offset + 4) : null;
  offset += maskOffset;

  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));

  if (mask) {
    for (const [index, value] of payload.entries()) {
      payload[index] = value ^ (mask[index % 4] ?? 0);
    }
  }

  return {
    consumedBytes: offset + payloadLength,
    opcode,
    payload,
  };
};

const sendHttpJsonResponse = (
  socket: Duplex,
  input: {
    payload: unknown;
    statusCode: number;
  },
): void => {
  const body = JSON.stringify(input.payload);

  socket.end(
    [
      `HTTP/1.1 ${input.statusCode} ${STATUS_CODES[input.statusCode] ?? "Error"}`,
      "Connection: close",
      "Content-Type: application/json; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "",
      body,
    ].join("\r\n"),
  );
};

const encodeJsonWebSocketMessage = (payload: unknown): Buffer => {
  return encodeWebSocketFrame({
    opcode: 0x1,
    payload: Buffer.from(JSON.stringify(payload), "utf8"),
  });
};

const sendJsonWebSocketMessage = (
  socket: Duplex,
  payload: unknown,
): boolean => {
  return socket.write(encodeJsonWebSocketMessage(payload));
};

const closeWebSocketConnection = (socket: Duplex): void => {
  socket.end(
    encodeWebSocketFrame({
      opcode: 0x8,
    }),
  );
};

const parseLogsStreamQuery = (
  request: IncomingMessage,
): z.infer<typeof ProjectLogsStreamQuerySchema> => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const parsedQuery = ProjectLogsStreamQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );

  if (!parsedQuery.success) {
    throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
  }

  return parsedQuery.data;
};

const createSafeStreamError = (message = PROJECT_LOGS_STREAM_ERROR_MESSAGE) => {
  return ProjectLogsStreamErrorSchema.parse({
    message,
    type: "error",
  });
};

const isBenignSocketError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & {
    code?: string;
  };

  return errorWithCode.code === "ECONNRESET" || errorWithCode.code === "EPIPE";
};

const sendPreUpgradeError = (socket: Duplex, error: unknown) => {
  const { payload, statusCode } = toApiErrorResponse(error);

  sendHttpJsonResponse(socket, {
    payload,
    statusCode,
  });
};

const handleLogsWebSocketUpgrade = async (input: {
  app: FastifyInstance;
  authService: Pick<AuthService, "getCurrentUser">;
  head: Buffer;
  logsStreamService: LogsStreamService;
  request: IncomingMessage;
  socket: Duplex;
}) => {
  const pathname = new URL(input.request.url ?? "/", "http://localhost")
    .pathname;

  if (pathname !== "/api/ws/logs") {
    sendPreUpgradeError(input.socket, appErrors.notFound());

    return;
  }

  const upgradeHeader = input.request.headers.upgrade;
  const webSocketKey = input.request.headers["sec-websocket-key"];

  if (
    typeof upgradeHeader !== "string" ||
    upgradeHeader.toLowerCase() !== "websocket" ||
    typeof webSocketKey !== "string" ||
    webSocketKey.length === 0
  ) {
    sendPreUpgradeError(
      input.socket,
      appErrors.validation(VALIDATION_ERROR_MESSAGE),
    );

    return;
  }

  let streamStopped = false;
  let socketClosed = false;
  let bufferedIncomingFrames = Buffer.from(input.head);
  const pendingFrames: Buffer[] = [];
  let pendingFrameBytes = 0;
  let pendingTerminalFrame: Buffer | null = null;
  let closeAfterFlush = false;
  let flushScheduled = false;
  let snapshotDelivered = false;
  let socketBackpressured = false;
  const cleanupCallbacks: Array<() => void> = [];

  const clearPendingFrames = () => {
    pendingFrames.length = 0;
    pendingFrameBytes = 0;
  };

  const stopStream = () => {
    if (streamStopped) {
      return;
    }

    streamStopped = true;
    clearPendingFrames();
    pendingTerminalFrame = null;

    for (const callback of cleanupCallbacks) {
      callback();
    }
  };

  const destroySocketSafely = () => {
    if (socketClosed) {
      return;
    }

    socketClosed = true;
    stopStream();
    closeWebSocketConnection(input.socket);
  };

  const flushPendingEvents = () => {
    if (
      !snapshotDelivered ||
      socketClosed ||
      socketBackpressured ||
      input.socket.destroyed
    ) {
      return;
    }

    if (
      closeAfterFlush &&
      pendingFrames.length === 0 &&
      pendingTerminalFrame === null
    ) {
      destroySocketSafely();

      return;
    }

    while (pendingFrames.length > 0) {
      const frame = pendingFrames.shift();

      if (!frame) {
        continue;
      }

      pendingFrameBytes -= frame.length;

      if (!input.socket.write(frame)) {
        socketBackpressured = true;

        return;
      }
    }

    if (!pendingTerminalFrame) {
      return;
    }

    const terminalFrame = pendingTerminalFrame;

    pendingTerminalFrame = null;
    closeAfterFlush = true;

    if (!input.socket.write(terminalFrame)) {
      socketBackpressured = true;

      return;
    }

    destroySocketSafely();
  };

  const scheduleFlush = () => {
    if (flushScheduled || socketClosed) {
      return;
    }

    flushScheduled = true;

    queueMicrotask(() => {
      flushScheduled = false;
      flushPendingEvents();
    });
  };

  const queueLineFrame = (serviceName: string, line: string) => {
    if (streamStopped || socketClosed || pendingTerminalFrame) {
      return;
    }

    const frame = encodeJsonWebSocketMessage(
      ProjectLogsStreamLineSchema.parse({
        line,
        serviceName,
        type: "line",
      }),
    );

    pendingFrames.push(frame);
    pendingFrameBytes += frame.length;

    if (pendingFrameBytes > PROJECT_LOGS_STREAM_MAX_PENDING_BYTES) {
      stopStream();
      clearPendingFrames();
      pendingTerminalFrame = encodeJsonWebSocketMessage(
        createSafeStreamError(PROJECT_LOGS_STREAM_OVERLOAD_ERROR_MESSAGE),
      );
      closeAfterFlush = true;
      scheduleFlush();

      return;
    }

    scheduleFlush();
  };

  const queueTerminalError = (message: string) => {
    if (socketClosed || pendingTerminalFrame) {
      return;
    }

    stopStream();
    clearPendingFrames();
    pendingTerminalFrame = encodeJsonWebSocketMessage(
      createSafeStreamError(message),
    );
    closeAfterFlush = true;
    scheduleFlush();
  };

  try {
    const query = parseLogsStreamQuery(input.request);
    const accessToken = query.accessToken;

    if (!accessToken) {
      throw appErrors.unauthorized();
    }

    await input.authService.getCurrentUser(accessToken);

    const streamSession = await input.logsStreamService.openProjectLogsStream({
      onError: () => {
        queueTerminalError(PROJECT_LOGS_STREAM_ERROR_MESSAGE);
      },
      onLine: (line) => {
        queueLineFrame(query.serviceName, line);
      },
      projectId: query.projectId,
      serviceName: query.serviceName,
      tail: query.tail,
    });

    cleanupCallbacks.push(() => {
      streamSession.stop();
    });

    input.socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${createSecWebSocketAccept(webSocketKey)}`,
        "Upgrade: websocket",
        "",
        "",
      ].join("\r\n"),
    );

    socketBackpressured = !sendJsonWebSocketMessage(
      input.socket,
      ProjectLogsStreamSnapshotSchema.parse({
        ...streamSession.snapshot,
        type: "snapshot",
      }),
    );
    snapshotDelivered = true;
    scheduleFlush();

    const handleIncomingFrames = () => {
      while (true) {
        const parsedFrame = tryParseWebSocketFrame(bufferedIncomingFrames);

        if (!parsedFrame) {
          return;
        }

        bufferedIncomingFrames = Buffer.from(
          bufferedIncomingFrames.subarray(parsedFrame.consumedBytes),
        );

        if (parsedFrame.opcode === 0x8) {
          destroySocketSafely();

          return;
        }

        if (parsedFrame.opcode === 0x9) {
          input.socket.write(
            encodeWebSocketFrame({
              opcode: 0x0a,
              payload: parsedFrame.payload,
            }),
          );
        }
      }
    };

    input.socket.on("data", (chunk) => {
      bufferedIncomingFrames = Buffer.concat([bufferedIncomingFrames, chunk]);
      handleIncomingFrames();
    });
    input.socket.on("drain", () => {
      socketBackpressured = false;
      scheduleFlush();
    });
    input.socket.on("close", () => {
      socketClosed = true;
      stopStream();
    });
    input.socket.on("end", () => {
      socketClosed = true;
      stopStream();
    });
    input.socket.on("error", (error) => {
      socketClosed = true;
      stopStream();

      if (!isBenignSocketError(error)) {
        input.app.log.error(error);
      }
    });

    handleIncomingFrames();
  } catch (error) {
    sendPreUpgradeError(input.socket, error);
  }
};

export const registerLogsWebSocket = (input: {
  app: FastifyInstance;
  authService: Pick<AuthService, "getCurrentUser"> | undefined;
  logsStreamService: LogsStreamService | undefined;
}): void => {
  const activeSockets = new Set<Duplex>();

  input.app.addHook("preClose", async () => {
    for (const socket of activeSockets) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
  });

  input.app.addHook("onClose", async () => {
    activeSockets.clear();
  });

  input.app.server.on("upgrade", (request, socket, head) => {
    activeSockets.add(socket);
    socket.on("close", () => {
      activeSockets.delete(socket);
    });

    if (!input.authService || !input.logsStreamService) {
      sendPreUpgradeError(socket, new Error(INTERNAL_ERROR_MESSAGE));

      return;
    }

    void handleLogsWebSocketUpgrade({
      app: input.app,
      authService: input.authService,
      head,
      logsStreamService: input.logsStreamService,
      request,
      socket,
    });
  });
};
