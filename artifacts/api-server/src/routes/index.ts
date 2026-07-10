import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import groupsRouter from "./groups";
import monitorRouter from "./monitor";
import messagesRouter from "./messages";
import accountsRouter from "./accounts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(groupsRouter);
router.use(monitorRouter);
router.use(messagesRouter);
router.use(accountsRouter);

export default router;
