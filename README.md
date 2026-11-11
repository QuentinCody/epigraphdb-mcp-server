# epigraphdb-mcp-server

MCP access to the [EpiGraphDB API](https://api.epigraphdb.org/), integrating epidemiological, genetic, pathway and literature evidence. Public access requires no API key. Local port: `8887`.

Code Mode tools are `epigraphdb_search` and `epigraphdb_execute`; inspect staged results with `epigraphdb_query_data` and `epigraphdb_get_schema`. Each tool also has a `mcp_` alias. Existing supported MR, ontology, gene/drug, literature and PPI operations retain their native responses.

## Added evidence coverage

| Native operation | Inputs | Interpretation |
| --- | --- | --- |
| `GET /genetic-cor` | Exact `trait`, optional `cor_coef_threshold` | Genetic correlations, signed coefficients, uncertainty and GWAS identifiers |
| `GET /obs-cor` | Exact `trait`, optional `cor_coef_threshold` | Observational correlations, distinct from genetic correlation or MR |
| `GET /pathway` | Exact `trait`, optional `pval_threshold` | GWAS instrument→variant→gene→protein→pathway mappings |
| `POST /protein/in-pathway` | JSON `{ uniprot_id_list: [...] }`, 1–100 accessions | Protein pathway membership, native counts and Reactome identifiers |
| `GET /pqtl/` | `query`, `searchflag`, `rtype`, optional `pvalue` | Separate pQTL database MR/instrument/sensitivity products |
| `GET /pqtl/pleio/` | `rsid`, `prflag=count` or `proteins` | Associated protein count or records for an instrument |
| `GET /pqtl/list/` | `flag=exposures` or `outcomes` | Returned searchable entities in the observed pQTL build |

The adapter-owned `GET /evidence/coverage` reads live `/builds` and `/openapi.json`, checks build stability, and returns advertised operations with their schema components. Advertisements establish a published contract, not successful execution or exhaustive dataset coverage. Use the native pQTL lists for actual returned entities. Do not substitute historical website counts for observed coverage.

[Provider examples](https://docs.epigraphdb.org/api/api-endpoints/) apply `abs(coefficient) > cor_coef_threshold` to both correlation routes. The native accepted range is -1..1, with default 0.8. Preserve negative coefficients; a negative threshold does not mean “negative correlations only.” Trait labels can identify multiple studies, so keep GWAS IDs and duplicate source records.

The pathway `pval_threshold` applies to GWAS instruments, not a pathway-enrichment test. Membership and graph mapping do not establish causality.

## pQTL evidence and builds

`/pqtl/` requires an explicit `searchflag` (`proteins` or `traits`) and `rtype`:

- `simple`: summary evidence
- `mrres`: MR estimates
- `sglmr`: single-SNP MR
- `inst`: instrument information
- `sense`: sensitivity analyses

Preserve effect/SE, method, instrument count, cis/trans, colocalization, directionality and heterogeneity fields as returned. Null and `NA` values are unknown, not failed tests. The default MR p-value threshold is 0.5; select an appropriate explicit value for analysis. Instrument associations and MR estimates require their own assumptions and sensitivity assessment; no automatic causal conclusion or ranking is produced.

The [pQTL browser](https://docs.epigraphdb.org/web-ui/pqtl/) and [xQTL browser](https://docs.epigraphdb.org/web-ui/xqtl/) describe distinct products and coverage. These new `/pqtl/` operations use the separate `/builds.pqtl` version. Correlation/pathway operations use `/builds.epigraphdb.database`, with API/overall versions also checked. The currently advertised `3.0` is not hard-coded into requests, is not a genome assembly and does not establish a new 2026 release.

The optional adapter-only query parameter `expected_build` rejects mismatches. It is removed before forwarding upstream. Builds are observed before and after every new evidence request, and source metadata, request parameters, retrieval time and response hash are retained in `_epigraphdb`. Checks detect observed drift; they do not create an atomic snapshot, select historical data or identify the release of each contributing dataset. Genome assembly and source-data release remain unknown unless supplied in the retained provider records.

`_epigraphdb.response_sha256` hashes canonical JSON of the complete provider envelope before adapter metadata, so it remains verifiable after staging reorders object keys. `receipts[].response_sha256` hashes the original native response bytes; these are distinct hash scopes. Receipts include the source URL, method, status, media type, byte count and retrieval time. Rejected responses retain complete native error bodies and preceding build observations when available within the response bounds.

Native pQTL protein-count responses use `{ metadata: null, results: 3 }` (or zero). This is one count observation, not three reconstructed protein records. The single-SNP product retains the native `se_slg` spelling, and sensitivity fields remain separate from the filtered MR p-value.

## Literature and protein mappings

The old catalog path `/literature/mr` is absent from the current OpenAPI and returns native HTTP 404. Its error remains explicit. Use the documented `/literature/gwas/pairwise` for distinct trait-pair literature evidence; it does not validate an MR causal interpretation. On October 4, a broad BMI/CHD label query exceeded the native probe deadline, while `gwas_id: "ieu-a-2"`, `assoc_gwas_id: "ieu-a-7"`, `by_gwas_id: true`, `limit: 2` returned two rows. Study IDs and free-text labels are separate selectors.

`/literature/gwas` also uses a separate `gwas_id` parameter with `by_gwas_id: true`. Its `semmed_predicates` accepts an array encoded as repeated query parameters. Literature `limit`/`skip` are native pagination controls; this does not establish pagination for the correlation/pathway/pQTL routes. `POST /mappings/gene-to-protein` resolves `{ gene_name_list: ["TP53", "JAK2"] }` to native UniProt mappings for subsequent PPI or pathway requests.

## Recipes and transport

Seven discoverable workflows preserve full API responses, including errors and staging handles. For example:

```javascript
return await api.get("/pqtl/", {
  query: "ADAM15",
  searchflag: "proteins",
  rtype: "simple",
  pvalue: 1e-5,
});
```

Follow up with `rtype: "sense"` and `"inst"` using the same entity and observed build. The documented list parameters (`exposures`/`outcomes`) differ from search parameters (`proteins`/`traits`).

No native limit/offset contract is documented for the added correlation/pathway/pQTL routes. The adapter rejects invented pagination parameters, caps upstream responses at 2MiB and uses a 45-second HTTP budget. Complete MCP responses above 30KiB stage through the shared transport, including SQL, schema and errors. Oversized upstream results fail explicitly; narrow the query or threshold. Complete envelopes, duplicates and unknown values are retained. Empty results do not establish biological absence, and returned entity lists do not establish exhaustive coverage.

Staged evidence exposes `results` with legacy flattened scalar columns, nested objects/arrays as JSON text, and `native_json` for each full source row. `records` holds the evidence context; scalar counts use `count_observations`. `payloads` retains the complete original response. Use `get_schema` before SQL, and recover large text from `payloads`/`content_chunks` in bounded substrings. The shared SQL response ceiling is 98,304 bytes; use explicit `LIMIT`/`OFFSET`, fewer columns or aggregates for larger queries. A SQL cost error returns no partial rows.

## Validation

October 4 native reads report core database/API/overall build `1.0` and separate pQTL build `3.0`. Observed examples include 424 waist-circumference genetic correlation rows at absolute threshold 0.5 (36 negative), six observational rows at 0.8 including duplicates, 858 LDL instrument-to-pathway rows, all five ADAM15 pQTL products, 989 listed exposures and 225 outcomes. These are observations from the requested queries, not release dates or assertions of complete graph coverage.

Provider-derived fixtures and actual Code Mode/SQLite tests cover build drift, native null metadata and zero counts, signs, duplicate rows, pQTL modes, POST bodies, bounded HTTP reads, native error retention, all aliases and canonical citation/staging recovery. Dated live acceptance details and outstanding audit scope are recorded in the [implementation tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md). Nothing in this local validation deploys the Worker.

Start locally with `./scripts/dev-servers.sh epigraphdb`.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from EpiGraphDB and stays under the terms of that source: No platform data license; aggregates IEU OpenGWAS, whose EULA limits use to private or non-commercial research.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
