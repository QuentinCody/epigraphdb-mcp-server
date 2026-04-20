import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { epigraphdbFetch } from "./http";

/**
 * Route Code Mode api.get/api.post calls to the EpiGraphDB REST API.
 *
 * Importantly: the isolate's `api.post(...)` sends method=POST + body, and
 * some EpiGraphDB endpoints (e.g. /protein/ppi, /protein/ppi/pairwise)
 * ONLY accept POST. We previously dropped method + body here, turning every
 * call into a GET → upstream 405.
 */
export function createEpiGraphDbApiFetch(): ApiFetchFn {
    return async (request) => {
        const method = String(request.method || "GET").toUpperCase();
        const isBodyMethod = method === "POST" || method === "PUT" || method === "PATCH";

        const response = await epigraphdbFetch(request.path, request.params, {
            method,
            ...(isBodyMethod && request.body !== undefined ? { body: request.body as string | object } : {}),
        });

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
