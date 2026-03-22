import { Router, type IRouter } from "express";
import { telegramService } from "../services/telegram.js";
import { SaveMonitorSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/monitor/settings", (req, res) => {
  const settings = telegramService.getSettings();
  res.json(settings);
});

router.post("/monitor/settings", (req, res) => {
  try {
    const settings = SaveMonitorSettingsBody.parse(req.body);
    telegramService.saveSettings(settings);
    res.json({ success: true, message: "Settings saved" });
  } catch (err: any) {
    req.log.error({ err }, "save settings error");
    res.status(400).json({ error: err.message });
  }
});

router.post("/monitor/start", (req, res) => {
  try {
    telegramService.startMonitor();
    res.json({ success: true, message: "Monitor started" });
  } catch (err: any) {
    req.log.error({ err }, "start monitor error");
    res.status(400).json({ error: err.message });
  }
});

router.post("/monitor/stop", (req, res) => {
  try {
    telegramService.stopMonitor();
    res.json({ success: true, message: "Monitor stopped" });
  } catch (err: any) {
    req.log.error({ err }, "stop monitor error");
    res.status(400).json({ error: err.message });
  }
});

router.get("/monitor/status", (req, res) => {
  const stats = telegramService.getStats();
  res.json(stats);
});

export default router;
