import { expect, it } from "vitest";
import { createApp } from "./app.js";

it("persists a farm through validated REST and returns version conflict without overwrite", async () => {
  const { app } = createApp({ databasePath: ":memory:" });
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/farms",
    headers: { "idempotency-key": "create" },
    payload: { name: "Farm" },
  });
  expect(created.statusCode).toBe(200);
  const farm = created.json().data;
  const saved = await app.inject({
    method: "PATCH",
    url: `/api/v1/farms/${farm.id}`,
    headers: { "idempotency-key": "save" },
    payload: { expected_version: 1, name: "Updated" },
  });
  expect(saved.json().data.version).toBe(2);
  const stale = await app.inject({
    method: "PATCH",
    url: `/api/v1/farms/${farm.id}`,
    headers: { "idempotency-key": "stale" },
    payload: { expected_version: 1, name: "Wrong" },
  });
  expect(stale.statusCode).toBe(409);
  const read = await app.inject(`/api/v1/farms/${farm.id}`);
  expect(read.json().data.name).toBe("Updated");
  await app.close();
});
