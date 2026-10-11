import { expect, it } from "vitest";
import { createApp } from "./app.js";

it("persists a farm through validated REST and returns version conflict without overwrite", async () => {
  const { app, sessionToken } = createApp({
    databasePath: ":memory:",
    origin: "http://localhost:80",
  });
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/farms",
    headers: { "idempotency-key": "create", "x-sakha-session": sessionToken },
    payload: { name: "Farm" },
  });
  expect(created.statusCode).toBe(200);
  const farm = created.json().data;
  const saved = await app.inject({
    method: "PATCH",
    url: `/api/v1/farms/${farm.id}`,
    headers: { "idempotency-key": "save", "x-sakha-session": sessionToken },
    payload: { expected_version: 1, name: "Updated" },
  });
  expect(saved.json().data.version).toBe(2);
  const stale = await app.inject({
    method: "PATCH",
    url: `/api/v1/farms/${farm.id}`,
    headers: { "idempotency-key": "stale", "x-sakha-session": sessionToken },
    payload: { expected_version: 1, name: "Wrong" },
  });
  expect(stale.statusCode).toBe(409);
  const read = await app.inject({
    url: `/api/v1/farms/${farm.id}`,
    headers: { "x-sakha-session": sessionToken },
  });
  expect(read.json().data.name).toBe("Updated");
  await app.close();
});
it("rejects foreign host, cross-origin bootstrap and absent session; token rotates at restart", async () => {
  const { app, sessionToken } = createApp({
    databasePath: ":memory:",
    origin: "http://localhost:80",
  });
  expect(
    (
      await app.inject({
        url: "/api/v1/bootstrap",
        headers: { origin: "https://untrusted.example" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        url: "/api/v1/bootstrap",
        headers: { host: "evil.example" },
      })
    ).statusCode,
  ).toBe(403);
  expect((await app.inject("/api/v1/settings")).statusCode).toBe(403);
  const bootstrap = await app.inject("/api/v1/bootstrap");
  expect(bootstrap.json().data.session_token).toBe(sessionToken);
  const settings = await app.inject({
    url: "/api/v1/settings",
    headers: { "x-sakha-session": sessionToken },
  });
  expect(settings.statusCode).toBe(200);
  await app.close();
  const restarted = createApp({
    databasePath: ":memory:",
    origin: "http://localhost:80",
  });
  expect(restarted.sessionToken).not.toBe(sessionToken);
  await restarted.app.close();
});
it("returns valid Home and specialist capabilities before external consent is granted", async () => {
  const s = createApp({
    databasePath: ":memory:",
    origin: "http://localhost:80",
    runtime: {
      getCapabilities: async () => ({
        ready: true,
        text: true,
        cancel: true,
        resume: false,
        approvals: false,
        attachments: false,
        version: "test-double",
      }),
      startTurn: async () => ({ text: "unused" }),
    },
  });
  const response = await s.app.inject({
    method: "POST",
    url: "/api/v1/farms",
    headers: {
      "idempotency-key": "home-profile",
      "x-sakha-session": s.sessionToken,
    },
    payload: { name: "Synthetic Home test" },
  });
  const id = response.json().data.id;
  const home = await s.app.inject({
    url: `/api/v1/farms/${id}/home`,
    headers: { "x-sakha-session": s.sessionToken },
  });
  expect(home.statusCode).toBe(200);
  expect(
    home
      .json()
      .data.sections.agents[0].capabilities.find(
        (x: { key: string }) => x.key === "chat",
      ).status,
  ).toBe("disabled");
  await s.app.close();
});
