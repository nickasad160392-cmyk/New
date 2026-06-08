import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import attendanceRouter from "./attendance";
import leaveRouter from "./leave";
import adminRouter from "./admin";
import tasksRouter from "./tasks";
import goalsRouter from "./goals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(attendanceRouter);
router.use(leaveRouter);
router.use(adminRouter);
router.use(tasksRouter);
router.use(goalsRouter);

export default router;
