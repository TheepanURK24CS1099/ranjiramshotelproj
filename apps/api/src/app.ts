import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/environment.js";
import { requestLogger } from "./config/logger.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import { notFoundMiddleware } from "./common/middleware/not-found.js";
import { requestIdMiddleware } from "./common/middleware/request-id.js";
import routes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);

app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(helmet());
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(routes);
app.use(notFoundMiddleware);
app.use(errorHandler);

export default app;
