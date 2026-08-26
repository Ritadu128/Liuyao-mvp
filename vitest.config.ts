import path from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "client", "src"),
      "@shared": path.resolve(projectRoot, "shared"),
    },
  },
  test: {
    include: ["server/**/*.test.ts"],
    environment: "node",
  },
});
