import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.CJ_MCP_ADMIN_TOKEN;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const token = process.env.CJ_MCP_TOKEN;
  if (!token) return NextResponse.json({ configured: false, error: "CJ integration is not configured." }, { status: 503 });
  const client = new Client({ name: "helpmey-backend", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://developers.cjdropshipping.com/mcp/" + encodeURIComponent(token)));
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return NextResponse.json({ configured: true, tools: result.tools.map((tool) => ({ name: tool.name, description: tool.description || "" })) });
  } catch {
    return NextResponse.json({ configured: true, error: "CJ MCP connection unavailable." }, { status: 503 });
  } finally {
    await transport.close().catch(() => undefined);
  }
}
