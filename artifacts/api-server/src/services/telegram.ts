import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { EventEmitter } from "events";
import { logger } from "../lib/logger.js";
import fs from "fs";
import path from "path";

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

interface PersistedAccount {
  id: string;
  phone: string;
  sessionString: string;
  userInfo: { id: string; firstName: string; lastName: string; username: string; phone: string } | null;
}

// Hardcoded API credentials — never change
const FIXED_API_ID = 22043994;
const FIXED_API_HASH = "56f64582b363d367280db96586b97801";

const SESSIONS_FILE = path.join("/tmp", "anwer_accounts.json");

export const otpEmitter = new EventEmitter();

// ─── Per-Account Client ───────────────────────────────────────────────────────
export class TelegramAccountClient {
  public readonly id: string;
  public phone: string;
  private client: TelegramClient | null = null;
  private session: StringSession;
  private phoneCodeHash: string = "";
  private monitorRunning: boolean = false;
  private messagesReceived: number = 0;
  private autoRepliesSent: number = 0;
  private sentMessages: SentMessageRecord[] = [];
  public authorized: boolean = false;
  public userInfo: { id: string; firstName: string; lastName: string; username: string; phone: string } | null = null;
  private settings: MonitorSettings = {
    targetGroupIds: [],
    keywords: [],
    autoReplyText: "",
    autoReplyEnabled: false,
    monitorGroupIds: [],
  };

  constructor(id: string, phone: string = "", sessionString: string = "") {
    this.id = id;
    this.phone = phone;
    this.session = new StringSession(sessionString);
  }

  getSessionString(): string {
    return this.session.save();
  }

  async reconnect(): Promise<boolean> {
    try {
      this.client = new TelegramClient(this.session, FIXED_API_ID, FIXED_API_HASH, {
        connectionRetries: 3,
        timeout: 30,
      });
      await this.client.connect();
      const me = await this.client.getMe();
      if (me) {
        this.authorized = true;
        this.userInfo = {
          id: String((me as any).id || ""),
          firstName: (me as any).firstName || "",
          lastName: (me as any).lastName || "",
          username: (me as any).username || "",
          phone: (me as any).phone || this.phone,
        };
        if (this.settings.autoReplyEnabled && !this.monitorRunning) {
          this.startMonitor();
        }
        return true;
      }
    } catch (err) {
      logger.error({ err, accountId: this.id }, "Failed to reconnect account");
      this.client = null;
      this.authorized = false;
    }
    return false;
  }

  async sendCode(phone: string): Promise<{ phoneCodeHash: string }> {
    this.phone = phone;
    if (this.client) {
      try { await this.client.disconnect(); } catch {}
    }
    this.session = new StringSession("");
    this.client = new TelegramClient(this.session, FIXED_API_ID, FIXED_API_HASH, {
      connectionRetries: 5,
      timeout: 30,
    });
    await this.client.connect();
    const result = await this.client.sendCode(
      { apiId: FIXED_API_ID, apiHash: FIXED_API_HASH },
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
            logger.info({ code, accountId: this.id }, "Auto-detected OTP");
            otpEmitter.emit("otp", code);
            this.autoVerify(code);
            return;
          }
        }
        setTimeout(checkMessages, 1500);
      } catch {
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
      logger.error({ err, accountId: this.id }, "Auto-verify failed");
      otpEmitter.emit("verified", { success: false, error: err.message });
    }
  }

  async verifyCode(phone: string, code: string, phoneCodeHash: string, password?: string): Promise<{ user: any }> {
    if (!this.client) throw new Error("Client not initialized. Call sendCode first.");
    const user = await this.client.signIn(
      { apiId: FIXED_API_ID, apiHash: FIXED_API_HASH },
      {
        phoneNumber: phone,
        phoneCode: () => Promise.resolve(code),
        phoneCodeHash,
        password: password ? () => Promise.resolve(password) : undefined,
      }
    );
    this.authorized = true;
    const me = user as any;
    this.userInfo = {
      id: String(me?.id || ""),
      firstName: me?.firstName || "",
      lastName: me?.lastName || "",
      username: me?.username || "",
      phone: me?.phone || phone,
    };
    if (this.settings.autoReplyEnabled && !this.monitorRunning) {
      this.startMonitor();
    }
    return { user };
  }

  isConnected(): boolean {
    return this.client !== null && this.client.connected;
  }

  isAuthorized(): boolean {
    return this.authorized && this.client !== null && this.client.connected;
  }

  async getUser(): Promise<any> {
    if (this.userInfo) return this.userInfo;
    if (!this.client) return null;
    try { return await this.client.getMe(); } catch { return null; }
  }

  async getDialogs(): Promise<any[]> {
    if (!this.client) throw new Error("Not connected");
    const dialogs = await this.client.getDialogs({ limit: 200 });
    return dialogs
      .filter((d: any) => d.isGroup || d.isChannel)
      .map((d: any) => ({
        id: String(d.id),
        name: d.title || d.name || "Unknown",
        type: d.isChannel ? "channel" : "group",
        membersCount: d.entity?.participantsCount || 0,
      }));
  }

  getSettings(): MonitorSettings { return this.settings; }
  saveSettings(settings: MonitorSettings): void { this.settings = settings; }

  startMonitor(): void {
    if (this.monitorRunning) return;
    this.monitorRunning = true;
    this.runMonitorLoop();
  }

  stopMonitor(): void { this.monitorRunning = false; }
  isMonitorRunning(): boolean { return this.monitorRunning; }

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
              this.settings.keywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
            if (hasKeyword) {
              await this.client!.sendMessage(chatId, { message: this.settings.autoReplyText });
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
        this.sentMessages.push({ groupId, groupName: groupId, messageId: msgId, text, sentAt: new Date().toISOString() });
      } catch (err) {
        logger.error({ err, groupId }, "Failed to send message");
        throw err;
      }
    }
  }

  async editMessage(groupIds: string[], newText: string): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    for (const groupId of groupIds) {
      const record = [...this.sentMessages].reverse().find((m) => m.groupId === groupId);
      if (record) {
        await this.client.editMessage(groupId, { message: record.messageId, text: newText });
        record.text = newText;
      }
    }
  }

  async deleteMessage(groupIds: string[]): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    for (const groupId of groupIds) {
      const record = [...this.sentMessages].reverse().find((m) => m.groupId === groupId);
      if (record) {
        await this.client.deleteMessages(groupId, [record.messageId], { revoke: true });
        this.sentMessages = this.sentMessages.filter(
          (m) => !(m.groupId === groupId && m.messageId === record.messageId)
        );
      }
    }
  }

  getLastSentText(groupIds: string[]): string {
    for (const groupId of groupIds) {
      const record = [...this.sentMessages].reverse().find((m) => m.groupId === groupId);
      if (record) return record.text;
    }
    return "";
  }

  getSentMessages(): SentMessageRecord[] { return this.sentMessages; }

  async disconnect(): Promise<void> {
    this.monitorRunning = false;
    this.authorized = false;
    if (this.client) {
      try { await this.client.destroy(); } catch {}
      this.client = null;
    }
    this.session = new StringSession("");
  }
}

// ─── Account Manager ──────────────────────────────────────────────────────────
class AccountManager {
  private accounts: Map<string, TelegramAccountClient> = new Map();
  private activeAccountId: string | null = null;
  // Pending client being authenticated right now (not yet in accounts map)
  private pendingClient: TelegramAccountClient | null = null;

  constructor() {
    this.loadSessions();
  }

  // ── Persistence ──────────────────────────────────────────────
  private loadSessions(): void {
    try {
      if (!fs.existsSync(SESSIONS_FILE)) return;
      const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
      const data: { accounts: PersistedAccount[]; activeId: string | null } = JSON.parse(raw);
      for (const acc of data.accounts || []) {
        const client = new TelegramAccountClient(acc.id, acc.phone, acc.sessionString);
        client.authorized = false; // will be re-verified on reconnect
        client.userInfo = acc.userInfo;
        this.accounts.set(acc.id, client);
      }
      this.activeAccountId = data.activeId || null;
      // Reconnect all persisted accounts in background
      for (const [id, client] of this.accounts) {
        client.reconnect().then((ok) => {
          if (ok) {
            logger.info({ accountId: id }, "Account reconnected");
            this.saveSessions();
          }
        }).catch(() => {});
      }
      logger.info({ count: this.accounts.size }, "Loaded persisted accounts");
    } catch (err) {
      logger.error({ err }, "Failed to load sessions");
    }
  }

  saveSessions(): void {
    try {
      const accounts: PersistedAccount[] = Array.from(this.accounts.values()).map((c) => ({
        id: c.id,
        phone: c.phone,
        sessionString: c.getSessionString(),
        userInfo: c.userInfo,
      }));
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ accounts, activeId: this.activeAccountId }, null, 2), "utf-8");
    } catch (err) {
      logger.error({ err }, "Failed to save sessions");
    }
  }

  // ── Account CRUD ─────────────────────────────────────────────
  getActive(): TelegramAccountClient | null {
    if (!this.activeAccountId) return null;
    return this.accounts.get(this.activeAccountId) || null;
  }

  getAll(): { id: string; phone: string; authorized: boolean; userInfo: any }[] {
    return Array.from(this.accounts.values()).map((c) => ({
      id: c.id,
      phone: c.phone,
      authorized: c.isAuthorized(),
      userInfo: c.userInfo,
      isActive: c.id === this.activeAccountId,
    }));
  }

  getActiveId(): string | null { return this.activeAccountId; }

  setActive(id: string): boolean {
    if (!this.accounts.has(id)) return false;
    this.activeAccountId = id;
    this.saveSessions();
    return true;
  }

  removeAccount(id: string): void {
    const client = this.accounts.get(id);
    if (client) {
      client.disconnect().catch(() => {});
      this.accounts.delete(id);
    }
    if (this.activeAccountId === id) {
      this.activeAccountId = this.accounts.size > 0 ? this.accounts.keys().next().value : null;
    }
    this.saveSessions();
  }

  // ── Pending Login (for adding a new account) ─────────────────
  startPendingLogin(): TelegramAccountClient {
    // Create a fresh client slot for the incoming login
    const id = `acc_${Date.now()}`;
    const pending = new TelegramAccountClient(id, "", "");
    this.pendingClient = pending;
    return pending;
  }

  getPending(): TelegramAccountClient | null { return this.pendingClient; }

  // Called after successful verification — moves pending → accounts
  commitPending(): void {
    if (!this.pendingClient) return;
    const client = this.pendingClient;
    this.pendingClient = null;
    this.accounts.set(client.id, client);
    this.activeAccountId = client.id;
    this.saveSessions();
  }

  discardPending(): void {
    if (this.pendingClient) {
      this.pendingClient.disconnect().catch(() => {});
      this.pendingClient = null;
    }
  }

  // ── Legacy compatibility (used by existing routes) ───────────
  isConnected(): boolean { return this.getActive()?.isConnected() ?? false; }
  isAuthorized(): boolean { return this.getActive()?.isAuthorized() ?? false; }
  async getUser(): Promise<any> { return this.getActive()?.getUser() ?? null; }
  async getDialogs(): Promise<any[]> {
    const active = this.getActive();
    if (!active) throw new Error("No active account");
    return active.getDialogs();
  }
  getSettings(): MonitorSettings { return this.getActive()?.getSettings() ?? { targetGroupIds: [], keywords: [], autoReplyText: "", autoReplyEnabled: false, monitorGroupIds: [] }; }
  saveSettings(s: MonitorSettings): void { this.getActive()?.saveSettings(s); }
  startMonitor(): void { this.getActive()?.startMonitor(); }
  stopMonitor(): void { this.getActive()?.stopMonitor(); }
  isMonitorRunning(): boolean { return this.getActive()?.isMonitorRunning() ?? false; }
  getStats(): { running: boolean; messagesReceived: number; autoRepliesSent: number } { return this.getActive()?.getStats() ?? { running: false, messagesReceived: 0, autoRepliesSent: 0 }; }
  async sendMessage(groupIds: string[], text: string): Promise<void> {
    const active = this.getActive();
    if (!active) throw new Error("No active account");
    return active.sendMessage(groupIds, text);
  }
  async editMessage(groupIds: string[], newText: string): Promise<void> {
    const active = this.getActive();
    if (!active) throw new Error("No active account");
    return active.editMessage(groupIds, newText);
  }
  async deleteMessage(groupIds: string[]): Promise<void> {
    const active = this.getActive();
    if (!active) throw new Error("No active account");
    return active.deleteMessage(groupIds);
  }
  getSentMessages(): SentMessageRecord[] { return this.getActive()?.getSentMessages() ?? []; }
  async logout(): Promise<void> {
    const active = this.getActive();
    if (active) { this.removeAccount(active.id); }
  }
}

export const accountManager = new AccountManager();

// Backward-compatible alias so existing routes importing `telegramService` keep working
export const telegramService = accountManager;
