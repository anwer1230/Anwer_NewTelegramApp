import { Router, type IRouter } from "express";
import { telegramService } from "../services/telegram.js";
import {
  SendCodeBody,
  VerifyCodeBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/send-code", async (req, res) => {
  try {
    const { phone, apiId, apiHash } = SendCodeBody.parse(req.body);
    const result = await telegramService.sendCode(phone, apiId, apiHash);
    res.json({ success: true, phoneCodeHash: result.phoneCodeHash });
  } catch (err: any) {
    req.log.error({ err }, "send-code error");
    res.status(400).json({ error: err.message || "Failed to send code" });
  }
});

router.post("/auth/verify-code", async (req, res) => {
  try {
    const { phone, code, phoneCodeHash, password } = VerifyCodeBody.parse(req.body);
    const result = await telegramService.verifyCode(phone, code, phoneCodeHash, password);
    const user = result.user;
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

router.get("/auth/status", async (req, res) => {
  try {
    const connected = telegramService.isConnected();
    const authorized = telegramService.isAuthorized();
    let user = null;
    if (authorized) {
      const me = await telegramService.getUser();
      if (me) {
        user = {
          id: String(me.id || ""),
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
    await telegramService.logout();
    res.json({ success: true, message: "Logged out" });
  } catch (err: any) {
    req.log.error({ err }, "logout error");
    res.status(400).json({ error: err.message });
  }
});

export default router;
