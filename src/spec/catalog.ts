import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { evidenceEndpoints, evidenceWorkflows } from "./evidence";

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
    endpointCount: 15 + evidenceEndpoints.length,
    notes:
        "- ALWAYS start with a connectivity-guard call (`/ping`) before heavy queries if the API seems flaky.\n" +
        "- Most endpoints return `{ metadata, results: [...] }`; preserve metadata, source IDs and staging handles.\n" +
        "- Mendelian Randomization (`/mr`) is the flagship endpoint: give it `exposure_trait` + `outcome_trait` (free text).\n" +
        "- Ontology mapping (`/ontology/gwas-efo`) expects `trait`, `score_threshold`, and `fuzzy=true` for natural language.\n" +
        "- Gene endpoints accept `gene_name` (symbol) or Ensembl IDs; druggability/ppi endpoints surface tractable targets.\n" +
        "- Literature endpoints return PubMed-linked triples; large responses should be staged.\n" +
        "- Correlation, pathway membership and MR are distinct evidence. New evidence routes retain live database builds and unknown genome assembly; /pqtl/ and /xqtl/ have distinct coverage. No native pagination is documented for the new routes.\n" +
        "- Whole results over 30 KiB stage, including SQL/schema/errors. Preserve __staged handles and inspect get_schema. results retains native_json plus scalar/legacy flattened columns; nested objects and arrays have JSON text columns. Counts are one observation, not expanded rows.\n" +
        "- /literature/mr is absent from the current native OpenAPI and returned 404. Use /literature/gwas/pairwise for trait-pair literature evidence; it is not evidence that an MR estimate is causal.",
    workflows: evidenceWorkflows,
    endpoints: [
        ...evidenceEndpoints,
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
                { name: "score_threshold", type: "number", required: false, description: "Minimum similarity score (native default 0.75)" },
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
                { name: "pval_threshold", type: "number", required: false, description: "Native p-value threshold, default 1e-8; drug_name is not a documented filter" },
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
                { name: "trait", type: "string", required: false, description: "GWAS trait label when by_gwas_id is false" },
                { name: "gwas_id", type: "string", required: false, description: "GWAS study identifier when by_gwas_id is true" },
                { name: "semmed_predicates", type: "array", required: false, description: "SemMedDB predicate whitelist as repeated native query parameters; pass an array, not a comma-joined string." },
                { name: "by_gwas_id", type: "boolean", required: false, description: "Set true to use gwas_id instead of trait" },
                { name: "limit", type: "number", required: false, description: "Native page size 1–1000, default 50; do not infer a total." },
                { name: "skip", type: "number", required: false, description: "Native offset, default 0." },
            ],
        },
        {
            method: "GET",
            path: "/literature/mr",
            summary: "Unsupported legacy catalog path: native HTTP 404 and absent from current OpenAPI. Use /literature/gwas/pairwise for distinct trait-pair literature evidence; no MR-validation claim.",
            category: "literature",
            queryParams: [
                { name: "exposure_trait", type: "string", required: true, description: "Exposure trait" },
                { name: "outcome_trait", type: "string", required: true, description: "Outcome trait" },
                { name: "pval_threshold", type: "number", required: false, description: "Optional p-value filter" },
            ],
        },

        {method:"GET",path:"/literature/gwas/pairwise",category:"literature",summary:"Native trait-pair subject/predicate/object literature graph; distinct from MR estimates and causal validation.",queryParams:[
            {name:"trait",type:"string",required:false,description:"First native trait label."},
            {name:"assoc_trait",type:"string",required:false,description:"Associated native trait label."},
            {name:"gwas_id",type:"string",required:false,description:"First GWAS study ID when by_gwas_id is true."},
            {name:"assoc_gwas_id",type:"string",required:false,description:"Associated GWAS study ID when by_gwas_id is true."},
            {name:"by_gwas_id",type:"boolean",required:false,description:"Use study identifiers instead of labels."},
            {name:"limit",type:"number",required:false,description:"Native 1–2000 rows, default 50."},
            {name:"skip",type:"number",required:false,description:"Native offset, default 0."},
            {name:"semmantic_types",type:"array",required:false,description:"Native spelling; repeated semantic-type values. Defaults to nusq."},
            {name:"blacklist",type:"boolean",required:false,description:"Exclude listed types when true (default), include when false."},
        ]},
        {method:"POST",path:"/mappings/gene-to-protein",category:"networks",summary:"Resolve HGNC symbols or Ensembl gene IDs to native UniProt mappings; preserve one-to-many results.",description:"JSON body {gene_name_list:string[]} by default, or {gene_id_list:string[],by_gene_id:true}. Use returned accessions in PPI/pathway queries; do not treat symbols as UniProt IDs."},
        // ===================================================================
        // Protein networks (POST — upstream rejects GET with 405)
        // ===================================================================
        {
            method: "POST",
            path: "/protein/ppi",
            summary:
                "First-order protein-protein interactors. POST body: { uniprot_id_list: string[] } with UniProtKB accessions (e.g. ['P04637'] for TP53). Gene symbols are NOT accepted — resolve them first via /mappings/gene-to-protein or UniProt.",
            category: "networks",
            queryParams: [],
        },
        {
            method: "POST",
            path: "/protein/ppi/pairwise",
            summary:
                "Pairwise PPI evidence for a protein list. POST body: { uniprot_id_list: string[] } with UniProtKB accessions.",
            category: "networks",
            queryParams: [],
        },
    ],
};
