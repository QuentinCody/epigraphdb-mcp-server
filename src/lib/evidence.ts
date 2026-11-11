import { fail, hash, object } from "./response";
import { evidencePaths, evidenceRequest, type Params } from "./evidence-request";
export type Read = (path: string, params?: Params, method?: string, body?: unknown) => Promise<unknown>;
function version(value: unknown, name: string) {
  if (typeof value !== "string" || !value || value.length > 64) fail(`Live /builds does not establish ${name}`, 502);
  return value;
}
function build(raw: unknown, component: string) {
  const value = object(raw);
  if (component === "pqtl") return { database: version(value.pqtl, "pQTL build") };
  const core = object(value.epigraphdb);
  return { database: version(core.database, "EpiGraphDB database build"), api: version(core.api, "API build"), overall: version(core.overall, "overall build") };
}
function number(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`Provider returned invalid ${name}`, 502);
  return value;
}
function checkedRows(raw: unknown, count: boolean) {
  const payload = object(raw);
  if (payload.error !== undefined || payload.errors !== undefined || payload.detail !== undefined) fail("Provider returned an error payload", 502);
  // Native count mode has metadata:null (also optional in the published schema).
  // It is one count observation, not three reconstructed protein records.
  if(count && typeof payload.results === "number" && (payload.metadata===null || payload.metadata===undefined))return payload;
  const metadata = object(payload.metadata);
  if (typeof metadata.empty_results !== "boolean" || payload.results === undefined) fail("Evidence response lacks metadata/results", 502);
  if (Array.isArray(payload.results) && metadata.empty_results !== (payload.results.length === 0)) fail("Evidence empty-results metadata contradicts the returned rows", 502);
  return payload;
}
function checkRows(path: string, payload: Params, params: Params, body: unknown) {
  // Count responses are retained as returned; a count is never expanded into synthetic rows.
  if (path === "/pqtl/pleio/" && params.prflag === "count") {
    if (typeof payload.results !== "number" || !Number.isSafeInteger(payload.results) || payload.results < 0) fail("Provider returned an invalid protein count", 502);
    return;
  }
  if (!Array.isArray(payload.results))fail("Evidence response lacks a result array",502);
  for (const value of payload.results) {
    const row = object(value);
    if (path === "/genetic-cor" || path === "/obs-cor") {
      if (object(row.trait).trait !== params.trait) fail("Provider returned an unrequested trait", 502);
      const trait = object(row.trait); const associated = object(row.assoc_trait);
      if (typeof trait.id !== "string" || typeof associated.id !== "string" || typeof associated.trait !== "string") fail("Correlation row lacks trait identifiers", 502);
      const coefficient = path === "/genetic-cor" ? object(row.gc).rg : object(row.obs_cor).cor;
      if (Math.abs(number(coefficient, "correlation coefficient")) <= Number(params.cor_coef_threshold)) fail("Provider correlation does not satisfy the requested absolute threshold", 502);
    } else if (path === "/pathway") {
      if (object(row.gwas).trait !== params.trait) fail("Provider returned an unrequested pathway trait", 502);
      if (number(object(row.gwas_to_variant).pval, "instrument p-value") >= Number(params.pval_threshold)) fail("Provider instrument does not satisfy the requested p-value threshold", 502);
      for (const key of ["variant", "gene", "protein", "pathway"]) object(row[key]);
    } else if (path === "/protein/in-pathway") {
      if (!(object(body).uniprot_id_list as unknown[]).includes(row.uniprot_id)) fail("Provider returned an unrequested protein", 502);
    } else if (path === "/pqtl/") {
      const key = params.searchflag === "proteins" ? "expID" : "outID";
      if (row[key] !== undefined && row[key] !== params.query) fail("Provider returned an unrequested pQTL entity", 502);
      // Only the documented simple envelope establishes that this field is the filtered MR p-value.
      // Sensitivity/instrument products may use different statistics; preserve their native fields.
      if (params.rtype === "simple" && row.pvalue !== undefined && row.pvalue !== null && number(row.pvalue, "MR p-value") >= Number(params.pvalue)) fail("Provider MR result does not satisfy requested p-value threshold", 502);
    }
  }
}
export async function evidence(path: string, method: string, params: Params, body: unknown, read: Read) {
  const request = evidenceRequest(path, method, params, body);
  const before = await read("/builds"); const observed = build(before, request.component);
  if (request.expected_build !== undefined && observed.database !== request.expected_build) fail("Live database build differs from expected_build", 409);
  const payload = checkedRows(await read(path, request.upstream, method, body),path==="/pqtl/pleio/"&&request.upstream.prflag==="count");
  checkRows(path, payload, request.upstream, body);
  const after = await read("/builds");
  if (JSON.stringify(observed) !== JSON.stringify(build(after, request.component))) fail("Provider build changed during evidence retrieval; retry", 409);
  return { ...payload, _epigraphdb: {
    source_url: `https://api.epigraphdb.org${path}`, retrieved_at: new Date().toISOString(), component: request.component,
    builds_before: before, builds_after: after, request: { method, params: request.upstream, ...(body === undefined ? {} : { body }) },
    response_sha256: await hash(payload), hash_scope: "UTF-8 canonical JSON of the complete provider envelope before adapter metadata; object keys sorted, arrays and values unchanged. Native wire-byte hashes are in receipts.",
    genome_assembly: null, source_data_release: null,
    build_note: "Observed service/database builds are not genome assemblies, immutable dataset snapshots or release dates. No historical selection or atomic snapshot is implied.",
    completeness: "One provider response with no documented pagination/total contract for these operations. No local truncation or deduplication. Empty results do not prove absence of an association.",
    interpretation: "Genetic/observational correlations, pathway membership and MR estimates are distinct evidence. MR depends on instrument assumptions; sensitivity, colocalization and cis/trans context must be inspected separately. Missing values are unknown, not negative evidence. No automatic causal conclusion.",
  } };
}
export async function coverage(params: Params, read: Read) {
  if (Object.keys(params).length) fail("/evidence/coverage has no parameters");
  const before = await read("/builds"); const core = build(before, "epigraphdb"); const pqtl = build(before, "pqtl");
  const spec = object(await read("/openapi.json")); const paths = object(spec.paths);
  const advertised = evidencePaths.map(path => {
    const method = path === "/protein/in-pathway" ? "post" : "get";
    const item = paths[path] === undefined ? {} : object(paths[path]);
    return { path, method: method.toUpperCase(), advertised: item[method] !== undefined, operation: item[method] ?? null };
  });
  const after = await read("/builds");
  if (JSON.stringify(core) !== JSON.stringify(build(after, "epigraphdb")) || JSON.stringify(pqtl) !== JSON.stringify(build(after, "pqtl"))) fail("Provider build changed during coverage discovery", 409);
  return { builds_before: before, builds_after: after, advertised_operations: advertised, api_info: spec.info, components: spec.components,
    openapi_sha256: await hash(spec), hash_scope: "UTF-8 canonical JSON of the complete OpenAPI document; native wire-byte hashes are in receipts.", source_url: "https://api.epigraphdb.org/openapi.json", retrieved_at: new Date().toISOString(),
    note: "OpenAPI advertisements are not live query acceptance or exhaustive dataset coverage. Inspect /pqtl/list/ exposures/outcomes for the currently returned entities. Do not reuse old website counts or treat /xqtl/ as the separate pQTL database.",
    sources: ["https://docs.epigraphdb.org/web-ui/pqtl/", "https://docs.epigraphdb.org/web-ui/xqtl/", "https://docs.epigraphdb.org/FAQs/"] };
}
