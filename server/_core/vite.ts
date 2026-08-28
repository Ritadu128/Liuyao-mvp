import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("/{*splat}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // MediaPipe runtime/model paths are versioned by the client. Keep these large,
  // immutable assets in the browser cache so gesture startup is fast after the
  // first download instead of revalidating ~20 MB on every visit.
  const mediapipePath = path.resolve(distPath, "mediapipe");
  app.use(
    "/mediapipe",
    express.static(mediapipePath, {
      immutable: true,
      maxAge: "365d",
      setHeaders(res, filePath) {
        // The versioned Wasm binaries use a .bin URL so Cloudflare's default
        // static-extension cache can store them. Preserve the MIME required by
        // WebAssembly.instantiateStreaming().
        if (filePath.endsWith("_internal.bin")) {
          res.setHeader("Content-Type", "application/wasm");
        }
      },
    })
  );

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*splat}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
