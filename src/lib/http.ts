import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const EPIGRAPHDB_BASE = "https://api.epigraphdb.org";

export interface EpiGraphDbFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the EpiGraphDB REST API.
 * EpiGraphDB integrates MR-Base, ontologies, literature, and gene/drug data
 * from the MRC IEU epidemiology group at Bristol.
 */
export async function epigraphdbFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: EpiGraphDbFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? EPIGRAPHDB_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "epigraphdb-mcp-server/1.0 (bio-mcp)",
    });
}
