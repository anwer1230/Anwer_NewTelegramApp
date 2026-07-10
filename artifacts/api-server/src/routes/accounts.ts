import { Router, type IRouter } from "express";
import { accountManager } from "../services/telegram.js";

const router: IRouter = Router();

// List all accounts
router.get("/accounts", (req, res) => {
  try {
    const accounts = accountManager.getAll();
    const activeId = accountManager.getActiveId();
    res.json({ accounts, activeId });
  } catch (err: any) {
    req.log.error({ err }, "list accounts error");
    res.status(500).json({ error: err.message });
  }
});

// Switch active account
router.post("/accounts/switch", (req, res) => {
  try {
    const { accountId } = req.body as { accountId: string };
    if (!accountId) return res.status(400).json({ error: "accountId is required" });
    const ok = accountManager.setActive(accountId);
    if (!ok) return res.status(404).json({ error: "Account not found" });
    res.json({ success: true, activeId: accountId });
  } catch (err: any) {
    req.log.error({ err }, "switch account error");
    res.status(500).json({ error: err.message });
  }
});

// Remove an account
router.delete("/accounts/:id", (req, res) => {
  try {
    const { id } = req.params;
    accountManager.removeAccount(id);
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "remove account error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
