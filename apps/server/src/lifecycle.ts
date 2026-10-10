import { createHash } from "node:crypto";
import * as c from "@sakha/contracts";
import {
  type createFarmServices,
  DomainError,
  load,
  requireVersion,
} from "@sakha/farm";
import { z } from "zod";
import type { Storage } from "./storage/database.js";
export function createLifecycle(
  store: Storage,
  farm: ReturnType<typeof createFarmServices>,
) {
  const now = () => new Date().toISOString();
  function execute(
    name: c.OperationName,
    input: unknown,
    params: Record<string, string>,
  ): unknown {
    const farmId = params.farmId ?? "";
    if (name !== "getDeletion") farm.assertFarm(farmId);
    return store.transaction(() => {
      switch (name) {
        case "requestExport":
        case "requestDeletion": {
          const request =
            name === "requestExport"
              ? c.operations.requestExport.input.parse(input)
              : c.operations.requestDeletion.input.parse(input);
          const job = c.Job.parse({
            ...farm.makeBase(farmId),
            kind: name === "requestExport" ? "export" : "deletion",
            status: "queued",
            progress: "Queued locally; backend must remain running",
          });
          store.put("job", job);
          store.put("lifecycle_request", {
            ...farm.makeBase(farmId),
            id: job.id,
            request,
          });
          store.enqueue(farmId, "lifecycle", { job_id: job.id });
          return job;
        }
        case "getExport":
        case "getDeletion":
          return load(store, "job", params.jobId ?? "", farmId, c.Job);
        case "uploadAttachment": {
          const d = c.operations.uploadAttachment.input.parse(input);
          if (
            !/^(image\/jpeg|image\/png|image\/webp)$/.test(d.media_type) ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(d.data_base64)
          )
            throw new DomainError(
              "validation",
              "Use a valid JPEG, PNG or WebP image",
            );
          const bytes = Buffer.from(d.data_base64, "base64");
          if (!bytes.length || bytes.length > 8_000_000)
            throw new DomainError(
              "validation",
              "Photo must be between1byte and8MB",
            );
          const png = bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          const webp =
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
          if (
            !(d.media_type === "image/png"
              ? png
              : d.media_type === "image/jpeg"
                ? jpeg
                : webp)
          )
            throw new DomainError(
              "validation",
              "File signature does not match image type",
            );
          const attachment = c.Attachment.parse({
            ...farm.makeBase(farmId),
            name: d.name.replace(/[\r\n/\\]/g, "_").slice(0, 200),
            media_type: d.media_type,
            size_bytes: bytes.length,
            hash: createHash("sha256").update(bytes).digest("hex"),
            analysis_capability: {
              key: "image_analysis",
              status: "unavailable",
              reason:
                "Text runtimes do not analyze images; stored locally only",
              requirements: [
                "verified vision runtime and specific external-processing consent",
              ],
            },
          });
          store.put("attachment", attachment);
          store.db
            .prepare("INSERT INTO private_artifacts VALUES(?,?,?,?)")
            .run(attachment.id, farmId, "attachment", bytes);
          return attachment;
        }
        case "getAttachment":
          return load(
            store,
            "attachment",
            params.attachmentId ?? "",
            farmId,
            c.Attachment,
          );
        case "deleteAttachment": {
          const d = c.operations.deleteAttachment.input.parse(input);
          const item = load(
            store,
            "attachment",
            params.attachmentId ?? "",
            farmId,
            c.Attachment,
          );
          requireVersion(item, d.expected_version);
          store.db
            .prepare("DELETE FROM private_artifacts WHERE id=? AND farm_id=?")
            .run(item.id, farmId);
          store.remove("attachment", item.id, farmId);
          return { deleted: true };
        }
        default:
          throw new DomainError(
            "unavailable",
            "Lifecycle operation unavailable",
          );
      }
    });
  }
  function run(farmId: string, id: string) {
    const job = load(store, "job", id, farmId, c.Job);
    if (job.status !== "queued") return;
    const request = z
      .object({ request: z.unknown() })
      .parse(store.get("lifecycle_request", id, farmId)).request;
    store.transaction(() => {
      if (job.kind === "export") {
        const d = c.operations.requestExport.input.parse(request);
        const rows = store.db
          .prepare("SELECT kind,payload FROM records WHERE farm_id=?")
          .all(farmId) as { kind: string; payload: string }[];
        const selected = rows
          .filter(
            (x) =>
              !["job", "lifecycle_request", "export_content"].includes(x.kind),
          )
          .flatMap((x) => {
            const value = z
              .record(z.string(), z.unknown())
              .parse(JSON.parse(x.payload));
            if (
              !d.include_private &&
              (![
                "farm",
                "field",
                "fact",
                "evidence",
                "series",
                "series_projection",
              ].includes(x.kind) ||
                value.private === true ||
                ["F05", "F08"].includes(String(value.category)))
            )
              return [];
            return [{ kind: x.kind, record: value }];
          });
        const bytes = Buffer.from(
          JSON.stringify(
            {
              schema_version: c.CONTRACT_VERSION,
              exported_at: now(),
              includes_private: d.include_private,
              records: selected,
            },
            null,
            2,
          ),
        );
        if (bytes.length > 25_000_000)
          throw new DomainError(
            "unavailable",
            "Export exceeds local processing bound",
          );
        store.db
          .prepare("INSERT OR REPLACE INTO private_artifacts VALUES(?,?,?,?)")
          .run(job.id, farmId, "export", bytes);
        store.put("job", {
          ...job,
          status: "completed",
          progress: "Export ready locally",
          download_url: `/api/v1/farms/${farmId}/exports/${job.id}/download`,
          version: job.version + 1,
          updated_at: now(),
        });
      } else {
        const d = c.operations.requestDeletion.input.parse(request);
        if (d.scope === "farm") {
          store.db
            .prepare("DELETE FROM record_links WHERE farm_id=?")
            .run(farmId);
          store.db
            .prepare("DELETE FROM private_artifacts WHERE farm_id=?")
            .run(farmId);
          store.db.prepare("DELETE FROM records WHERE farm_id=?").run(farmId);
          store.db.prepare("DELETE FROM commands WHERE scope=?").run(farmId);
          store.db.prepare("DELETE FROM events WHERE farm_id=?").run(farmId);
          store.db.prepare("DELETE FROM outbox WHERE farm_id=?").run(farmId);
          store.db.prepare("DELETE FROM inbox WHERE farm_id=?").run(farmId);
          store.db
            .prepare("DELETE FROM memory_fts WHERE farm_id=?")
            .run(farmId);
        } else {
          const selected = store.db
            .prepare("SELECT id,kind,payload FROM records WHERE farm_id=?")
            .all(farmId) as { id: string; kind: string; payload: string }[];
          for (const row of selected) {
            const value = z
              .record(z.string(), z.unknown())
              .parse(JSON.parse(row.payload));
            const remove =
              d.scope === "conversations"
                ? ["conversation", "message", "run", "peer_run"].includes(
                    row.kind,
                  )
                : value.private === true ||
                  ["F05", "F08"].includes(String(value.category)) ||
                  ![
                    "farm",
                    "field",
                    "fact",
                    "evidence",
                    "series",
                    "series_projection",
                    "job",
                    "lifecycle_request",
                  ].includes(row.kind);
            if (
              remove &&
              (!d.record_ids?.length || d.record_ids.includes(row.id))
            ) {
              store.db
                .prepare(
                  "DELETE FROM record_links WHERE farm_id=? AND (owner_id=? OR target_id=?)",
                )
                .run(farmId, row.id, row.id);
              store.remove(row.kind, row.id, farmId);
              store.db
                .prepare(
                  "DELETE FROM private_artifacts WHERE id=? AND farm_id=?",
                )
                .run(row.id, farmId);
            }
          }
          // Derived indexes and cached command/event payloads cannot retain deleted private text.
          store.db
            .prepare("DELETE FROM memory_fts WHERE farm_id=?")
            .run(farmId);
          store.db.prepare("DELETE FROM commands WHERE scope=?").run(farmId);
          store.db.prepare("DELETE FROM events WHERE farm_id=?").run(farmId);
          store.db.prepare("DELETE FROM inbox WHERE farm_id=?").run(farmId);
          store.db
            .prepare("DELETE FROM outbox WHERE farm_id=? AND id<>?")
            .run(farmId, id);
          store.db
            .prepare("DELETE FROM private_artifacts WHERE farm_id=?")
            .run(farmId);
          for (const memory of store.list("memory", farmId))
            store.remove(
              "memory",
              z.object({ id: c.Id }).parse(memory).id,
              farmId,
            );
        }
        store.put("job", {
          ...job,
          status: "completed",
          progress:
            "Requested local records and derived indexes deleted; public source artifacts remain",
          version: job.version + 1,
          updated_at: now(),
        });
      }
    });
  }
  function download(farmId: string, id: string) {
    farm.assertFarm(farmId);
    const job = load(store, "job", id, farmId, c.Job);
    if (job.kind !== "export" || job.status !== "completed")
      throw new DomainError("not_found", "Export not ready");
    const row = store.db
      .prepare(
        "SELECT bytes FROM private_artifacts WHERE id=? AND farm_id=? AND kind='export'",
      )
      .get(id, farmId) as { bytes: Buffer } | undefined;
    if (!row) throw new DomainError("not_found", "Export artifact deleted");
    return row.bytes;
  }
  return { execute, run, download };
}
