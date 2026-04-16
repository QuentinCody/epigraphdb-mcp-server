import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { epigraphdbCatalog } from "../spec/catalog";
import { createEpiGraphDbApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    EPIGRAPHDB_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createEpiGraphDbApiFetch();

    const searchTool = createSearchTool({
        prefix: "epigraphdb",
        catalog: epigraphdbCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "epigraphdb",
        catalog: epigraphdbCatalog,
        apiFetch,
        doNamespace: env.EPIGRAPHDB_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
