import * as c from "@sakha/contracts";
import type { createCoreServices } from "@sakha/core";
import type { DemoCache } from "@sakha/data";
import { buildTeamSeed } from "@sakha/data";
import type { createFarmServices } from "@sakha/farm";
import type { Storage } from "./storage/database.js";

type Services = {
  store: Storage;
  farm: ReturnType<typeof createFarmServices>;
  core: ReturnType<typeof createCoreServices>;
};

export function persistTeamSeed(
  services: Services,
  farmId: string,
  cache: DemoCache,
) {
  const seed = buildTeamSeed(cache);
  let tick = 0;
  const stamp = () => new Date(Date.now() + tick++).toISOString();
  for (const item of seed.memory) {
    const role = seed.roles[item.team_id];
    if (!role) continue;
    const at = stamp();
    const memory = {
      ...services.farm.makeBase(farmId),
      role_key: role,
      text: item.text,
      fact_versions: {},
      origin_run: "seed",
      key: item.key,
      namespace: item.team_id,
      value: item.value,
      team_id: item.team_id,
      created_at: at,
      updated_at: at,
    };
    services.store.put("memory", memory);
    services.store.db
      .prepare(
        "INSERT INTO memory_fts(id,farm_id,role_key,content) VALUES(?,?,?,?)",
      )
      .run(memory.id, farmId, role, memory.text);
  }
  for (const status of seed.statuses) {
    const role = seed.roles[status.id];
    if (!role) continue;
    const at = stamp();
    services.store.put("team_status", {
      ...services.farm.makeBase(farmId),
      id: `status-${status.id}`,
      team_id: status.id,
      name: status.name,
      line: status.line,
      role_key: role,
      created_at: at,
      updated_at: at,
    });
  }
  for (const thread of seed.threads) {
    const role = seed.roles[thread.team_id];
    if (!role) continue;
    const conversation = c.Conversation.parse(
      services.core.execute(
        "createConversation",
        { role_key: role, title: thread.title },
        { farmId },
      ),
    );
    for (const message of thread.messages) {
      const at = stamp();
      services.store.put(
        "message",
        c.Message.parse({
          ...services.farm.makeBase(farmId),
          conversation_id: conversation.id,
          role_key: role,
          author: message.author,
          text: message.text,
          status: "final",
          context: {
            fact_versions: {},
            evidence: [],
            citations: (message.card?.sources ?? []).flatMap((source) =>
              source.url && /^https?:\/\//i.test(source.url)
                ? [
                    {
                      url: source.url,
                      title: source.title,
                      snippet: source.title,
                      source: source.adapter ?? source.title,
                      fetched_at: source.fetched_at,
                    },
                  ]
                : [],
            ),
            consulted: message.consulted,
            reviewed_by: message.reviewed_by,
            card: message.card,
          },
          team_id:
            message.author === "agent"
              ? (message.card?.agent ?? thread.team_id)
              : thread.team_id,
          reviewed_by: message.reviewed_by,
          consulted: message.consulted,
          card: message.card,
          created_at: at,
          updated_at: at,
        }),
      );
    }
  }
  return seed;
}
