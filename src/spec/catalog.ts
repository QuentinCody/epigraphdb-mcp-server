import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * EpiGraphDB (https://api.epigraphdb.org) — integrated epidemiology graph
 * from the MRC Integrative Epidemiology Unit at Bristol. Combines MR-Base
 * Mendelian Randomization, ontologies, literature mining, gene-drug
 * druggability, and PPI networks.
 *
 * Categories follow the upstream grouping so the LLM can search by topic.
 */
export const epigraphdbCatalog: ApiCatalog = {
    name: "EpiGraphDB",
    baseUrl: "https://api.epigraphdb.org",
    version: "1.0",
    auth: "none",
    endpointCount: 12,
    notes:
        "- ALWAYS start with a connectivity-guard call (`/ping`) before heavy queries if the API seems flaky.\n" +
        "- Most endpoints return `{ metadata, results: [...] }` — use `results` downstream.\n" +
        "- Mendelian Randomization (`/mr`) is the flagship endpoint: give it `exposure_trait` + `outcome_trait` (free text).\n" +
        "- Ontology mapping (`/ontology/gwas-efo`) expects `trait`, `score_threshold`, and `fuzzy=true` for natural language.\n" +
        "- Gene endpoints accept `gene_name` (symbol) or Ensembl IDs; druggability/ppi endpoints surface tractable targets.\n" +
        "- Literature endpoints return PubMed-linked triples; large responses should be staged.",
    endpoints: [
        // ===================================================================
        // Connectivity guards — call these first when unsure
        // ===================================================================
        {
            method: "GET",
            path: "/ping",
            summary: "Liveness probe — returns a short status payload",
            category: "connectivity",
        },
        {
            method: "GET",
            path: "/builds",
            summary: "List EpiGraphDB build/version information",
            category: "connectivity",
        },
        {
            method: "GET",
            path: "/meta/api-endpoints",
            summary: "Enumerate every available API endpoint in the running build",
            category: "connectivity",
        },

        // ===================================================================
        // Mendelian Randomization — differentiator of EpiGraphDB
        // ===================================================================
        {
            method: "GET",
            path: "/mr",
            summary: "Mendelian Randomization results for an exposure → outcome pair",
            category: "mendelian_randomization",
            queryParams: [
                { name: "exposure_trait", type: "string", required: false, description: "Exposure trait (e.g. 'Body mass index')" },
                { name: "outcome_trait", type: "string", required: false, description: "Outcome trait (e.g. 'Coronary heart disease')" },
                { name: "pval_threshold", type: "number", required: false, description: "P-value filter (default 1e-5)" },
            ],
        },
        {
            method: "GET",
            path: "/confounder",
            summary: "Find shared confounders between exposure and outcome",
            category: "mendelian_randomization",
            queryParams: [
                { name: "exposure_trait", type: "string", required: true, description: "Exposure trait" },
                { name: "outcome_trait", type: "string", required: true, description: "Outcome trait" },
                { name: "type", type: "string", required: false, description: "Confounder type", enum: ["confounder", "intermediate", "reverse_intermediate", "collider"] },
            ],
        },

        // ===================================================================
        // Ontology mapping
        // ===================================================================
        {
            method: "GET",
            path: "/ontology/gwas-efo",
            summary: "Map a free-text trait to GWAS + EFO ontology terms with a similarity score",
            category: "ontology",
            queryParams: [
                { name: "trait", type: "string", required: true, description: "Free-text trait (e.g. 'asthma')" },
                { name: "score_threshold", type: "number", required: false, description: "Minimum similarity score (default 0.7)" },
                { name: "fuzzy", type: "boolean", required: false, description: "Enable fuzzy matching" },
            ],
        },

        // ===================================================================
        // Gene / Drug
        // ===================================================================
        {
            method: "GET",
            path: "/gene/drugs",
            summary: "List approved / investigational drugs targeting a gene",
            category: "gene_drug",
            queryParams: [
                { name: "gene_name", type: "string", required: true, description: "HGNC gene symbol (e.g. 'IL6R')" },
            ],
        },
        {
            method: "GET",
            path: "/gene/druggability/ppi",
            summary: "Druggability of a gene's first-order protein-protein interactors",
            category: "gene_drug",
            queryParams: [
                { name: "gene_name", type: "string", required: true, description: "HGNC gene symbol" },
            ],
        },
        {
            method: "GET",
            path: "/drugs/risk-factors",
            summary: "List risk factors and traits mechanistically linked to a drug",
            category: "gene_drug",
            queryParams: [
                { name: "trait", type: "string", required: false, description: "Disease trait name" },
                { name: "drug_name", type: "string", required: false, description: "Drug name" },
            ],
        },

        // ===================================================================
        // Literature
        // ===================================================================
        {
            method: "GET",
            path: "/literature/gwas",
            summary: "PubMed evidence for GWAS trait associations (SemMedDB triples)",
            category: "literature",
            queryParams: [
                { name: "trait", type: "string", required: true, description: "GWAS trait" },
                { name: "semmed_predicates", type: "string", required: false, description: "Comma-separated SemMedDB predicates (e.g. 'CAUSES,TREATS')" },
                { name: "by_gwas_id", type: "boolean", required: false, description: "Set true to treat `trait` as a GWAS ID" },
            ],
        },
        {
            method: "GET",
            path: "/literature/mr",
            summary: "Literature support for an MR-inferred exposure → outcome relationship",
            category: "literature",
            queryParams: [
                { name: "exposure_trait", type: "string", required: true, description: "Exposure trait" },
                { name: "outcome_trait", type: "string", required: true, description: "Outcome trait" },
                { name: "pval_threshold", type: "number", required: false, description: "Optional p-value filter" },
            ],
        },

        // ===================================================================
        // Protein networks
        // ===================================================================
        {
            method: "GET",
            path: "/protein/ppi",
            summary: "First-order protein-protein interactors for a gene or UniProt accession",
            category: "networks",
            queryParams: [
                { name: "protein_name", type: "string", required: false, description: "UniProt protein name" },
                { name: "uniprot_id", type: "string", required: false, description: "UniProt accession" },
            ],
        },
    ],
};
