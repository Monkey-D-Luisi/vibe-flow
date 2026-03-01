/**
 * Mock Telegram bot API.
 * Records all outgoing messages for assertion without sending real messages.
 */

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  timestamp: string;
}

export class MockTelegramBot {
  readonly messages: TelegramMessage[] = [];

  sendMessage(chatId: string, text: string, parseMode?: 'HTML' | 'Markdown'): { ok: boolean; messageId: number } {
    const msg: TelegramMessage = {
      chatId,
      text,
      parseMode,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(msg);
    return { ok: true, messageId: this.messages.length };
  }

  getMessagesForChat(chatId: string): TelegramMessage[] {
    return this.messages.filter((m) => m.chatId === chatId);
  }

  hasMessage(text: string): boolean {
    return this.messages.some((m) => m.text.includes(text));
  }

  reset(): void {
    this.messages.length = 0;
  }
}

export const mockTelegram = new MockTelegramBot();
