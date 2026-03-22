import { Router, type IRouter } from "express";
import { telegramService } from "../services/telegram.js";

const router: IRouter = Router();

router.get("/groups", async (req, res) => {
  try {
    const groups = await telegramService.getDialogs();
    res.json({ groups });
  } catch (err: any) {
    req.log.error({ err }, "get groups error");
    res.status(400).json({ error: err.message || "Failed to get groups" });
  }
});

export default router;
