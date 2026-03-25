import { ProjectLogsStreamMessageSchema } from "@dockeradmin/shared";

export const projectLogsVisibleLineLimit = 400;
export const defaultProjectLogsTail = 200;

const trimProjectLogLines = (
  lines: readonly string[],
  maxLines = projectLogsVisibleLineLimit,
): string[] => {
  return lines.slice(Math.max(0, lines.length - maxLines));
};

export const createProjectLogsStreamUrl = (input: {
  accessToken: string;
  apiBaseUrl: string;
  projectId: string;
  serviceName: string;
  tail: number;
}): string => {
  const url = new URL("/api/ws/logs", input.apiBaseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("projectId", input.projectId);
  url.searchParams.set("serviceName", input.serviceName);
  url.searchParams.set("tail", String(input.tail));
  url.searchParams.set("accessToken", input.accessToken);

  return url.toString();
};

export const applyProjectLogsStreamMessage = (input: {
  currentLines: readonly string[];
  message: unknown;
}) => {
  const message = ProjectLogsStreamMessageSchema.parse(input.message);

  switch (message.type) {
    case "snapshot":
      return {
        error: null,
        lines: trimProjectLogLines(message.lines),
      };
    case "line":
      return {
        error: null,
        lines: trimProjectLogLines([...input.currentLines, message.line]),
      };
    case "error":
      return {
        error: message.message,
        lines: [...input.currentLines],
      };
  }
};
