import * as c from "@sakha/contracts";
import { expect, it } from "vitest";
import { createApp } from "../app.js";

function setup() {
  const app = createApp({ databasePath: ":memory:" });
  const farm = c.Farm.parse(
    app.farm.execute("createFarm", { name: "Test" }, {}),
  );
  return { ...app, farmId: farm.id };
}
it("exports locally with scoped download and deletes the requested farm through a durable job", async () => {
  const s = setup();
  const job = c.Job.parse(
    s.lifecycle.execute(
      "requestExport",
      { confirmed: true, include_private: false },
      { farmId: s.farmId },
    ),
  );
  expect(job.status).toBe("queued");
  await s.execution.tick();
  const completed = c.Job.parse(
    s.lifecycle.execute("getExport", {}, { farmId: s.farmId, jobId: job.id }),
  );
  expect(completed.status).toBe("completed");
  expect(completed.download_url).toContain("/download");
  expect(
    JSON.parse(s.lifecycle.download(s.farmId, job.id).toString()).records.some(
      (x: { kind: string }) => x.kind === "farm",
    ),
  ).toBe(true);
  expect(() => s.lifecycle.download("foreign", job.id)).toThrow();
  const deletion = c.Job.parse(
    s.lifecycle.execute(
      "requestDeletion",
      { confirmed: true, scope: "farm" },
      { farmId: s.farmId },
    ),
  );
  await s.execution.tick();
  expect(s.store.get("farm", s.farmId, s.farmId)).toBeUndefined();
  expect(
    c.Job.parse(
      s.lifecycle.execute(
        "getDeletion",
        {},
        { farmId: s.farmId, jobId: deletion.id },
      ),
    ).status,
  ).toBe("completed");
  expect(
    s.store.db.prepare("SELECT count(*) as count FROM private_artifacts").get(),
  ).toMatchObject({ count: 0 });
  await s.app.close();
});
it("validates image signatures and stores local photos without claiming analysis", async () => {
  const s = setup();
  expect(() =>
    s.lifecycle.execute(
      "uploadAttachment",
      {
        name: "fake.png",
        media_type: "image/png",
        data_base64: Buffer.from("wrong").toString("base64"),
      },
      { farmId: s.farmId },
    ),
  ).toThrow("signature");
  const photo = c.Attachment.parse(
    s.lifecycle.execute(
      "uploadAttachment",
      {
        name: "photo.png",
        media_type: "image/png",
        data_base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString(
          "base64",
        ),
      },
      { farmId: s.farmId },
    ),
  );
  expect(photo.analysis_capability.status).toBe("unavailable");
  expect(() =>
    s.lifecycle.execute(
      "getAttachment",
      {},
      { farmId: "foreign", attachmentId: photo.id },
    ),
  ).toThrow();
  s.lifecycle.execute(
    "deleteAttachment",
    { confirmed: true, expected_version: 1 },
    { farmId: s.farmId, attachmentId: photo.id },
  );
  expect(
    s.store.db.prepare("SELECT count(*) as count FROM private_artifacts").get(),
  ).toMatchObject({ count: 0 });
  await s.app.close();
});
