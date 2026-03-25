export type TelegramNotifierSendResult = "disabled" | "failed" | "sent";

export type TelegramNotifierService = {
  isConfigured: () => boolean;
  sendMessage: (input: {
    text: string;
  }) => Promise<TelegramNotifierSendResult>;
};

type TelegramSendMessageRequestInput = {
  botToken: string;
  chatId: string;
  text: string;
};

type CreateTelegramNotifierServiceOptions = {
  botToken?: string;
  chatId?: string;
  onWarning?: (message: string) => void;
  sendMessageRequest?: (
    input: TelegramSendMessageRequestInput,
  ) => Promise<void>;
};

const sendTelegramMessageRequest = async ({
  botToken,
  chatId,
  text,
}: TelegramSendMessageRequestInput): Promise<void> => {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram API request failed with status ${response.status}`,
    );
  }
};

export const createTelegramNotifierService = ({
  botToken,
  chatId,
  onWarning,
  sendMessageRequest = sendTelegramMessageRequest,
}: CreateTelegramNotifierServiceOptions): TelegramNotifierService => {
  const credentials =
    botToken && chatId
      ? {
          botToken,
          chatId,
        }
      : undefined;

  return {
    isConfigured: () => credentials !== undefined,
    async sendMessage({ text }) {
      if (!credentials) {
        return "disabled";
      }

      try {
        await sendMessageRequest({
          botToken: credentials.botToken,
          chatId: credentials.chatId,
          text,
        });

        return "sent";
      } catch {
        onWarning?.("Telegram notification failed");

        return "failed";
      }
    },
  };
};
