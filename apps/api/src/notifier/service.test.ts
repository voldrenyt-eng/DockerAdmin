import assert from "node:assert/strict";
import test from "node:test";

import { createTelegramNotifierService } from "./service.js";

test("createTelegramNotifierService stays disabled when Telegram env is incomplete", async () => {
  let requestCalled = false;
  const notifier = createTelegramNotifierService({
    sendMessageRequest: async () => {
      requestCalled = true;
    },
  });

  assert.equal(notifier.isConfigured(), false);

  const result = await notifier.sendMessage({
    text: "Deploy finished successfully",
  });

  assert.equal(result, "disabled");
  assert.equal(requestCalled, false);
});

test("createTelegramNotifierService sends a Telegram message when configured", async () => {
  const seenRequests: Array<{
    botToken: string;
    chatId: string;
    text: string;
  }> = [];
  const notifier = createTelegramNotifierService({
    botToken: "bot-token",
    chatId: "123456",
    sendMessageRequest: async (input) => {
      seenRequests.push(input);
    },
  });

  assert.equal(notifier.isConfigured(), true);

  const result = await notifier.sendMessage({
    text: "Deploy finished successfully",
  });

  assert.equal(result, "sent");
  assert.deepEqual(seenRequests, [
    {
      botToken: "bot-token",
      chatId: "123456",
      text: "Deploy finished successfully",
    },
  ]);
});

test("createTelegramNotifierService swallows Telegram request failures and emits a safe warning", async () => {
  const warnings: string[] = [];
  const notifier = createTelegramNotifierService({
    botToken: "bot-secret-token",
    chatId: "123456",
    onWarning: (message) => {
      warnings.push(message);
    },
    sendMessageRequest: async () => {
      throw new Error(
        "Request to https://api.telegram.org/botbot-secret-token/sendMessage failed",
      );
    },
  });

  const result = await notifier.sendMessage({
    text: "Deploy failed",
  });

  assert.equal(result, "failed");
  assert.deepEqual(warnings, ["Telegram notification failed"]);
  assert.equal(warnings[0]?.includes("bot-secret-token"), false);
});
