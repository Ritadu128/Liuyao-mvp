import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { applySecurityHeaders, enforceSameOriginApiMutations, handleMalformedJson } from "./security";
import { createHealthHandler } from "./health";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
