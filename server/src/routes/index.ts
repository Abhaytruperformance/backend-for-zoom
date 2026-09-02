import { Router } from "express";
import { authRouter } from "../modules/auth/routes.js";
import { zoomRouter } from "../modules/zoom/routes.js";
import { mailboxRouter } from "../modules/mailbox/routes.js";
import { meetingsRouter } from "../modules/meetings/routes.js";
import { knowledgeRouter } from "../modules/knowledge/routes.js";
import { actionsRouter } from "../modules/actions/routes.js";
import { decisionsRouter } from "../modules/decisions/routes.js";
import { contactsRouter } from "../modules/contacts/routes.js";
import { approvalRouter } from "../modules/approval/routes.js";
import { insightsRouter } from "../modules/insights/routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/zoom", zoomRouter);
apiRouter.use("/mailbox", mailboxRouter);
apiRouter.use("/meetings", meetingsRouter);
apiRouter.use("/accounts", knowledgeRouter);
apiRouter.use("/actions", actionsRouter);
apiRouter.use("/decisions", decisionsRouter);
apiRouter.use("/contacts", contactsRouter);
apiRouter.use("/approval", approvalRouter);
apiRouter.use("/insights", insightsRouter);
