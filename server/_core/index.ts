import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { applySecurityHeaders, enforceSameOriginApiMutations, handleMalformedJson } from "./security";
import { createHealthHandler } from "./health";
import {
  findAvailableDevelopmentPort,
  getDevelopmentPreferredPort,
  getProductionPort,
} from "./port";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use(applySecurityHeaders);
  // 只有在部署环境明确开启时才信任代理头，避免本地伪造 X-Forwarded-For 绕过限流。
  if (ENV.trustProxy) app.set("trust proxy", 1);
  // 本项目不接收用户文件；限制请求体以降低资源耗尽风险。
  app.use(express.json({ limit: "100kb" }));
  app.use(handleMalformedJson);
  app.use(express.urlencoded({ limit: "100kb", extended: false }));
  // 仅返回就绪状态；用于 Railway 切流前确认 MySQL 私有连接可用。
  app.get("/health", createHealthHandler());
  // OAuth 为后续可选能力；匿名版本未配置认证环境变量时不注册回调路由。
  if (process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID && process.env.JWT_SECRET) {
    const { registerOAuthRoutes } = await import("./oauth");
    registerOAuthRoutes(app);
  } else {
    console.info("[OAuth] Disabled: anonymous mode is active.");
  }
  // tRPC API
  app.use(
    "/api/trpc",
    enforceSameOriginApiMutations,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const preferredPort = isProduction
    ? getProductionPort(process.env.PORT)
    : getDevelopmentPreferredPort(process.env.PORT);
  const port = isProduction
    ? preferredPort
    : await findAvailableDevelopmentPort(preferredPort);

  if (!isProduction && port !== preferredPort) {
    console.info(`Development port ${preferredPort} is busy; using ${port}.`);
  }

  server.once("error", (error: NodeJS.ErrnoException) => {
    console.error(`[Startup] Unable to listen on configured port (${error.code ?? "unknown"}).`);
    process.exitCode = 1;
  });
  server.listen(port, "0.0.0.0", () => {
    console.info(`Server listening on port ${port}.`);
  });
}

startServer().catch(error => {
  const errorName = error instanceof Error ? error.name : "unknown";
  console.error(`[Startup] Fatal server startup error (${errorName}).`);
  process.exitCode = 1;
});
