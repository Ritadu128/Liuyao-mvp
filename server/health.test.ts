import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createHealthHandler } from "./_core/health";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server => new Promise<void>(resolve => server.close(() => resolve())),
    ),
  );
});

async function requestHealth(ready: boolean) {
  const app = express();
  app.get("/health", createHealthHandler(async () => ready));
  const server = createServer(app);
  servers.push(server);

  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return fetch(`http://127.0.0.1:${address.port}/health`);
}

describe("Railway health check", () => {
  it("returns 200 only when the database is reachable", async () => {
    const response = await requestHealth(true);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("returns a generic 503 without database details when unavailable", async () => {
    const response = await requestHealth(false);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" });
  });
});
