import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowedTools = ["search_products", "query_sku_details", "get_warehouses", "calculate_freight"] as const;
const schema = z.object({
  name: z.enum(allowedTools),
  arguments: z.record(z.unknown()).default({})
}).strict();

function authorized(request: Request) {
  const expected = process.env.CJ_MCP_ADMIN_TOKEN;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unsupported read-only CJ tool request." }, { status: 400 });
  const token = process.env.CJ_MCP_TOKEN;
  if (!token) return NextResponse.json({ error: "CJ integration is not configured." }, { status: 503 });
  const client = new Client({ name: "helpmey-backend", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://developers.cjdropshipping.com/mcp/" + encodeURIComponent(token)));
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: parsed.data.name, arguments: parsed.data.arguments });
    if (result.isError) return NextResponse.json({ error: "CJ tool returned an error." }, { status: 502 });
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: "CJ tool request failed." }, { status: 502 });
  } finally {
    await transport.close().catch(() => undefined);
  }
}
