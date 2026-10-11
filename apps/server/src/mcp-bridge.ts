import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { gatewaySchemas } from "@sakha/runtime-codex";
import { z } from "zod";

const gateway = process.env.SAKHA_RUN_GATEWAY;
const token = process.env.SAKHA_RUN_TOKEN;
if (!gateway || !token || new URL(gateway).hostname !== "127.0.0.1")
  throw new Error("Run-bound local gateway required");
const server = new McpServer({ name: "sakha-scoped-tools", version: "1.0.0" });
for (const [name, schema] of Object.entries(gatewaySchemas))
  server.registerTool(
    name,
    {
      description:
        name === "lookup_evidence"
          ? "List saved evidence authorized for this run. Use {} to discover available records; source_id is an exact catalog ID and text is a literal substring filter. Retry without text before declaring evidence missing. Principal and farm cannot be supplied."
          : `Run-bound Sakha ${name}; principal and farm cannot be supplied`,
      inputSchema: schema.shape,
      annotations: {
        readOnlyHint: [
          "read_farm_facts",
          "lookup_evidence",
          "recall_memory",
        ].includes(name),
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: unknown) => {
      const validated = schema.parse(args);
      const response = await fetch(gateway, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sakha-run": token },
        body: JSON.stringify({ name, args: validated }),
        signal: AbortSignal.timeout(30000),
      });
      const body = z
        .object({ data: z.unknown().optional(), error: z.string().optional() })
        .parse(await response.json());
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(body.data ?? { error: body.error }),
          },
        ],
        isError: !response.ok,
      };
    },
  );
await server.connect(new StdioServerTransport());
