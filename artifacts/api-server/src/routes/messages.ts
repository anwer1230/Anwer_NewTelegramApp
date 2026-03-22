import { Router, type IRouter } from "express";
import { telegramService } from "../services/telegram.js";
import { SendMessageBody, EditMessageBody, DeleteMessageBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/messages/send", async (req, res) => {
  try {
    const { groupIds, text } = SendMessageBody.parse(req.body);
    await telegramService.sendMessage(groupIds, text);
    res.json({ success: true, message: "Message sent" });
  } catch (err: any) {
    req.log.error({ err }, "send message error");
    res.status(400).json({ error: err.message || "Failed to send message" });
  }
});

router.post("/messages/edit", async (req, res) => {
  try {
    const { groupIds, newText } = EditMessageBody.parse(req.body);
    await telegramService.editMessage(groupIds, newText);
    res.json({ success: true, message: "Message edited" });
  } catch (err: any) {
    req.log.error({ err }, "edit message error");
    res.status(400).json({ error: err.message || "Failed to edit message" });
  }
});

router.post("/messages/delete", async (req, res) => {
  try {
    const { groupIds } = DeleteMessageBody.parse(req.body);
    await telegramService.deleteMessage(groupIds);
    res.json({ success: true, message: "Message deleted" });
  } catch (err: any) {
    req.log.error({ err }, "delete message error");
    res.status(400).json({ error: err.message || "Failed to delete message" });
  }
});

router.get("/messages/sent", (req, res) => {
  const messages = telegramService.getSentMessages();
  res.json({ messages });
});

export default router;
