import { Router, type IRouter } from "express";
import { accountManager, otpEmitter } from "../services/telegram.js";

const router: IRouter = Router();

router.post("/auth/send-code", async (req, res) => {
  try {
    const { phone } = req.body as { phone: string };
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "phone is required" });
    }

    // Discard any previous pending login and open a fresh slot
    accountManager.discardPending();
    const pending = accountManager.startPendingLogin();

    const result = await pending.sendCode(phone);
    res.json({ success: true, phoneCodeHash: result.phoneCodeHash });
  } catch (err: any) {
    req.log.error({ err }, "send-code error");
    accountManager.discardPending();
    res.status(400).json({ error: err.message || "Failed to send code" });
  }
});

router.post("/auth/verify-code", async (req, res) => {
  try {
    const { phone, code, phoneCodeHash, password } = req.body as {
      phone: string;
      code: string;
      phoneCodeHash: string;
      password?: string;
    };

    const pending = accountManager.getPending();
    if (!pending) {
      return res.status(400).json({ error: "No pending login. Call send-code first." });
    }

    const result = await pending.verifyCode(phone, code, phoneCodeHash, password);
    const user = result.user as any;

    // Move from pending → committed account pool
    accountManager.commitPending();

    res.json({
      success: true,
      user: {
        id: String(user?.id || ""),
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        username: user?.username || "",
        phone: user?.phone || phone,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "verify-code error");
    res.status(400).json({ error: err.message || "Failed to verify code" });
  }
});

router.get("/auth/otp-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("connected", { status: "listening" });

  const onOtp = (code: string) => { send("otp", { code }); };
  const onVerified = (result: { success: boolean; code?: string; error?: string }) => {
    send("verified", result);
    cleanup();
  };

  const cleanup = () => {
    otpEmitter.off("otp", onOtp);
    otpEmitter.off("verified", onVerified);
    try { res.end(); } catch {}
  };

  otpEmitter.on("otp", onOtp);
  otpEmitter.on("verified", onVerified);

  req.on("close", cleanup);

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch {}
  }, 15000);
  req.on("close", () => clearInterval(keepAlive));
});

router.get("/auth/status", async (req, res) => {
  try {
    const connected = accountManager.isConnected();
    const authorized = accountManager.isAuthorized();
    let user = null;
    if (authorized) {
      const me = await accountManager.getUser();
      if (me) {
        user = {
          id: String(me.id || me.id || ""),
          firstName: me.firstName || "",
          lastName: me.lastName || "",
          username: me.username || "",
          phone: me.phone || "",
        };
      }
    }
    res.json({ connected, authorized, user });
  } catch (err: any) {
    req.log.error({ err }, "auth/status error");
    res.json({ connected: false, authorized: false, user: null });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    await accountManager.logout();
    res.json({ success: true, message: "Logged out" });
  } catch (err: any) {
    req.log.error({ err }, "logout error");
    res.status(400).json({ error: err.message });
  }
});

export default router;
