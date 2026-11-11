import type { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";
import {epigraphdbResponse} from "../lib/tool-result";

interface QueryEnv {
    EPIGRAPHDB_DATA_DO?: unknown;
}

export function registerQueryData(server: McpServer, env?: QueryEnv): void {
    const handler = createQueryDataHandler("EPIGRAPHDB_DATA_DO", "epigraphdb");

    for (const name of ["epigraphdb_query_data", "mcp_epigraphdb_query_data"]) server.registerTool(
        name,
        {
            title: "Query Staged EpiGraphDB Data",
            description:
                "Query staged EpiGraphDB data using SQL. Use this when responses are too large and have been staged with a data_access_id.",
            inputSchema: {
                data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
                sql: z.string().min(1).describe("SQL query to execute against the staged data"),
                limit: z.number().int().positive().max(10000).optional().describe("Maximum number of rows to return (default: 100)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: QueryEnv })?.env || {};
            return epigraphdbResponse(()=>handler(args as Record<string, unknown>, runtimeEnv as Record<string, unknown>),runtimeEnv,name,extra,args);
        },
    );
}
