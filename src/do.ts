import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class EpiGraphDbDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // EpiGraphDB responses consistently wrap rows under `results`.
        if (Array.isArray((obj as { results?: unknown[] }).results)) {
            const sample = (obj.results as unknown[])[0];
            if (sample && typeof sample === "object") {
                const s = sample as Record<string, unknown>;
                if ("mr" in s || "b" in s) {
                    return { tableName: "mr_results", indexes: ["exposure.trait", "outcome.trait"] };
                }
                if ("efo" in s || "gwas" in s) {
                    return { tableName: "ontology_mappings", indexes: ["trait", "score"] };
                }
                if ("drug" in s || "drugs" in s) {
                    return { tableName: "gene_drugs", indexes: ["gene.name", "drug.label"] };
                }
                if ("literature" in s || "pubmed_id" in s) {
                    return { tableName: "literature_evidence", indexes: ["pubmed_id"] };
                }
                return { tableName: "results" };
            }
        }

        return undefined;
    }
}
