import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { createEpiGraphDbApiFetch } from "../lib/api-adapter";
import { epigraphdbCatalog } from "../spec/catalog";
afterEach(() => vi.unstubAllGlobals());
const builds = { epigraphdb: { database: "1.0", overall: "1.0", api: "1.0" }, pqtl: "3.0" };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
it("registers both aliases and discovers evidence workflows with both-fields contracts", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["epigraphdb_search", "epigraphdb_execute", "epigraphdb_query_data", "epigraphdb_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  const result = await tools.mcp_epigraphdb_search.handler({ query: "pQTL MR summary with sensitivity context", category: "workflows", max_results: 5 }, {});
  expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
  expect(JSON.stringify(result)).toContain("ADAM15");
  expect(await tools.mcp_epigraphdb_query_data.handler({ data_access_id: "epigraphdb_fixture", sql: "SELECT 1" }, {})).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: expect.any(Object) });
  expect(epigraphdbCatalog.endpointCount).toBe(epigraphdbCatalog.endpoints.length);
});
it("stages full evidence/source metadata with nulls, signs and duplicate source rows intact", async () => {
  const row = { expID: "ADAM15", beta: -0.2, se: 0.05, pvalue: 0, coloc_prob: null, method: "Wald ratio", trans_cis: "trans", source: "α".repeat(8500) };
  const raw = { metadata: { empty_results: false, query: "provider query", total_seconds: null }, results: [row, row] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(builds)).mockResolvedValueOnce(json(raw)).mockResolvedValueOnce(json(builds)));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({ success: true, tables_created: ["results"], total_rows: 2, input_rows: 2, table_row_counts: { results: 2 } });
    }
    return json({ success: true, schema: { tables: { results: { columns: [{ name: "expID" }] } } } });
  } }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ apiFetch: createEpiGraphDbApiFetch(), catalog: epigraphdbCatalog, doNamespace: namespace, stagingPrefix: "epigraphdb", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/pqtl/", params: { query: "ADAM15", searchflag: "proteins", rtype: "simple" } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String) });
  expect(JSON.parse(stored[0] as string)).toMatchObject({ ...raw, _epigraphdb: { builds_before: builds, component: "pqtl", response_sha256: expect.any(String) } });
  expect(stored[1]).toMatchObject({ ...raw, _epigraphdb: { genome_assembly: null } });
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30_000);
});
it.each([{ __api_error: true, status: 409 }, { __staged: true, data_access_id: "epigraphdb_fixture" }, { __stage_error: true, message: "staging unavailable" }])("recipes preserve error and staging handles %#", async handle => {
  for (const workflow of epigraphdbCatalog.workflows!) {
    const run = new Function("api", `return (async () => { ${workflow.code} })()`);
    expect(await run({ get: vi.fn().mockResolvedValue(handle), post: vi.fn().mockResolvedValue(handle) })).toEqual(handle);
  }
});
it("build failures survive canonical proxy handling", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(builds)));
  const proxy = createApiProxyTool({ apiFetch: createEpiGraphDbApiFetch(), catalog: epigraphdbCatalog, stagingPrefix: "epigraphdb", maxInlineBytes: 30 * 1024 });
  expect(await proxy.handler({ method: "GET", path: "/pqtl/list/", params: { flag: "exposures", expected_build: "2.0" } }, { sql: () => [] })).toMatchObject({ __api_error: true, status: 409, incomplete: true });
});
