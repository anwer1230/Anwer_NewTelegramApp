import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { EventEmitter } from "events";
import { logger } from "../lib/logger.js";

interface SentMessageRecord {
  groupId: string;
  groupName: string;
  messageId: number;
  text: string;
  sentAt: string;
}

interface MonitorSettings {
  targetGroupIds: string[];
  keywords: string[];
  autoReplyText: string;
  autoReplyEnabled: boolean;
  monitorGroupIds: string[];
}

export const otpEmitter = new EventEmitter();

class TelegramService {
  private client: TelegramClient | null = null;
  private session: StringSession = new StringSession("");
  private apiId: number = 0;
  private apiHash: string = "";
  private phoneCodeHash: string = "";
  private phone: string = "";
  private monitorRunning: boolean = false;
  private messagesReceived: number = 0;
  private autoRepliesSent: number = 0;
  private sentMessages: SentMessageRecord[] = [];
  private authorized: boolean = false;
  private settings: MonitorSettings = {
    targetGroupIds: [],
    keywords: [],
    autoReplyText: "",
    autoReplyEnabled: false,
    monitorGroupIds: [],
  };

  async sendCode(phone: string, apiId: number, apiHash: string): Promise<{ phoneCodeHash: string }> {
    this.phone = phone;
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.authorized = false;

    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // ignore
      }
    }

    this.session = new StringSession("");
    this.client = new TelegramClient(this.session, apiId, apiHash, {
      connectionRetries: 5,
      timeout: 30,
    });

    await this.client.connect();

    const result = await this.client.sendCode(
      { apiId, apiHash },
      phone
    );

    this.phoneCodeHash = result.phoneCodeHash;

    this.startOtpListener();

    return { phoneCodeHash: result.phoneCodeHash };
  }

  private startOtpListener() {
    if (!this.client) return;

    const checkMessages = async () => {
      if (!this.client) return;
      try {
        const messages = await this.client.getMessages(777000, { limit: 3 });
        for (const msg of messages) {
          const text: string = (msg as any).message || "";
          const match = text.match(/(\d{5,6})/);
          if (match) {
            const code = match[1];
            logger.info({ code }, "Auto-detected OTP code");
            otpEmitter.emit("otp", code);
            this.autoVerify(code);
            return;
          }
        }
        setTimeout(checkMessages, 1500);
      } catch (err) {
        setTimeout(checkMessages, 2000);
      }
    };

    setTimeout(checkMessages, 2000);
  }

  private async autoVerify(code: string) {
    try {
      await this.verifyCode(this.phone, code, this.phoneCodeHash);
      otpEmitter.emit("verified", { success: true, code });
    } catch (err: any) {
      logger.error({ err }, "Auto-verify failed");
      otpEmitter.emit("verified", { success: false, error: err.message });
    }
  }

  async verifyCode(phone: string, code: string, phoneCodeHash: string, password?: string): Promise<{ user: any }> {
    if (!this.client) {
      throw new Error("Client not initialized. Call sendCode first.");
    }

    const user = await this.client.signIn(
      { apiId: this.apiId, apiHash: this.apiHash },
      {
        phoneNumber: phone,
        phoneCode: () => Promise.resolve(code),
        phoneCodeHash,
        password: password ? () => Promise.resolve(password) : undefined,
      }
    );

    this.authorized = true;

    this.startMonitorIfNeeded();

    return { user };
  }

  private startMonitorIfNeeded() {
    if (this.settings.autoReplyEnabled && !this.monitorRunning) {
      this.startMonitor();
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.connected;
  }

  isAuthorized(): boolean {
    return this.authorized && this.client !== null && this.client.connected;
  }

  async getUser(): Promise<any> {
    if (!this.client) return null;
    try {
      const me = await this.client.getMe();
      return me;
    } catch {
      return null;
    }
  }

  async getDialogs(): Promise<any[]> {
    if (!this.client) throw new Error("Not connected");
    const dialogs = await this.client.getDialogs({ limit: 200 });
    return dialogs
      .filter((d: any) => d.isGroup || d.isChannel)
      .map((d: any) => ({
        id: String(d.id),
        name: d.title || d.name || "Unknown",
        type: d.isChannel ? "channel" : d.isGroup ? "group" : "group",
        membersCount: d.entity?.participantsCount || 0,
      }));
  }

  getSettings(): MonitorSettings {
    return this.settings;
  }

  saveSettings(settings: MonitorSettings): void {
    this.settings = settings;
  }

  startMonitor(): void {
    if (this.monitorRunning) return;
    this.monitorRunning = true;
    this.runMonitorLoop();
  }

  stopMonitor(): void {
    this.monitorRunning = false;
  }

  isMonitorRunning(): boolean {
    return this.monitorRunning;
  }

  getStats() {
    return {
      running: this.monitorRunning,
      messagesReceived: this.messagesReceived,
      autoRepliesSent: this.autoRepliesSent,
    };
  }

  private async runMonitorLoop() {
    if (!this.client) return;

    try {
      const { NewMessage } = await import("telegram/events/index.js");
      this.client.addEventHandler(async (event: any) => {
        if (!this.monitorRunning) return;
        try {
          const message = event.message;
          const text = message?.message || "";
          const chatId = String(message?.chatId || "");

          this.messagesReceived++;

          if (
            this.settings.autoReplyEnabled &&
            this.settings.autoReplyText &&
            this.settings.monitorGroupIds.includes(chatId)
          ) {
            const hasKeyword =
              this.settings.keywords.length === 0 ||
              this.settings.keywords.some((kw) =>
                text.toLowerCase().includes(kw.toLowerCase())
              );

            if (hasKeyword) {
              await this.client!.sendMessage(chatId, {
                message: this.settings.autoReplyText,
              });
              this.autoRepliesSent++;
            }
          }
        } catch (err) {
          logger.error({ err }, "Error in message handler");
        }
      }, new NewMessage({}));
    } catch (err) {
      logger.error({ err }, "Error starting monitor");
      this.monitorRunning = false;
    }
  }

  async sendMessage(groupIds: string[], text: string): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    for (const groupId of groupIds) {
      try {
        const result = await this.client.sendMessage(groupId, { message: text });
        const msgId = typeof result === "object" && "id" in result ? (result as any).id : 0;
        this.sentMessages.push({
          groupId,
          groupName: groupId,
          messageId: msgId,
          text,
          sentAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err, groupId }, "Failed to send message");
        throw err;
      }
    }
  }

  async editMessage(groupIds: string[], newText: string): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    for (const groupId of groupIds) {
      const record = [...this.sentMessages]
        .reverse()
        .find((m) => m.groupId === groupId);
      if (record) {
        await this.client.editMessage(groupId, {
          message: record.messageId,
          text: newText,
        });
        record.text = newText;
      }
    }
  }

  async deleteMessage(groupIds: string[]): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    for (const groupId of groupIds) {
      const record = [...this.sentMessages]
        .reverse()
        .find((m) => m.groupId === groupId);
      if (record) {
        await this.client.deleteMessages(groupId, [record.messageId], { revoke: true });
        this.sentMessages = this.sentMessages.filter(
          (m) => !(m.groupId === groupId && m.messageId === record.messageId)
        );
      }
    }
  }

  getSentMessages(): SentMessageRecord[] {
    return this.sentMessages;
  }

  async logout(): Promise<void> {
    if (this.client) {
      this.monitorRunning = false;
      this.authorized = false;
      try {
        await this.client.destroy();
      } catch {
        // ignore
      }
      this.client = null;
    }
    this.session = new StringSession("");
    this.sentMessages = [];
    this.messagesReceived = 0;
    this.autoRepliesSent = 0;
  }
}

export const telegramService = new TelegramService();
