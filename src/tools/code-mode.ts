import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { epigraphdbCatalog } from "../spec/catalog";
import { createEpiGraphDbApiFetch } from "../lib/api-adapter";
import {epigraphdbResponse} from "../lib/tool-result";

interface CodeModeEnv {
    EPIGRAPHDB_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createEpiGraphDbApiFetch();
    const registrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const callback=rest.pop() as (args:unknown,extra:unknown)=>Promise<Parameters<typeof epigraphdbResponse>[0] extends ()=>Promise<infer R>?R:never>;
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        for(const alias of [String(name),`mcp_${String(name)}`])register(alias,...rest,(input:unknown,extra:unknown)=>epigraphdbResponse(()=>callback(input,extra),env,alias,extra,input));
    } };

    const searchTool = createSearchTool({
        prefix: "epigraphdb",
        catalog: epigraphdbCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "epigraphdb",
        // Verifiable provenance: epigraphdb_execute results carry a _meta.citation.
        source: { id: "epigraphdb", name: "EpiGraphDB", url: "https://epigraphdb.org" },
        catalog: epigraphdbCatalog,
        apiFetch,
        preserveApiErrors:true,
        maxInlineBytes: 30 * 1024,
        timeout: 90_000,
        doNamespace: env.EPIGRAPHDB_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(registrar);
}
