import { fail, object } from "./response";
export type Params = Record<string, unknown>;
export const evidencePaths = ["/genetic-cor", "/obs-cor", "/pathway", "/protein/in-pathway", "/pqtl/", "/pqtl/pleio/", "/pqtl/list/"];
const allowed: Record<string, string[]> = {
  "/genetic-cor": ["trait", "cor_coef_threshold"], "/obs-cor": ["trait", "cor_coef_threshold"],
  "/pathway": ["trait", "pval_threshold"], "/protein/in-pathway": [],
  "/pqtl/": ["query", "rtype", "searchflag", "pvalue"],
  "/pqtl/pleio/": ["rsid", "prflag"], "/pqtl/list/": ["flag"],
};
function text(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 300 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fail(`${name} must be a nonempty string of at most 300 characters`);
}
function number(value: unknown, name: string, min = 0, max = 1) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${name} must be a finite number from ${min} to ${max}`);
}
function choice(value: unknown, name: string, values: string[]) {
  if (!values.includes(String(value)) || typeof value !== "string") fail(`${name} must be one of ${values.join(", ")}`);
}
export function evidenceRequest(path: string, method: string, params: Params, body?: unknown) {
  if (!evidencePaths.includes(path)) fail("Unknown evidence operation", 404);
  if (method !== (path === "/protein/in-pathway" ? "POST" : "GET")) fail("Unsupported method for evidence operation", 405);
  for (const key of Object.keys(params)) if (![...allowed[path], "expected_build"].includes(key)) fail(`Unsupported evidence parameter: ${key}; no native pagination is documented`);
  if (params.expected_build !== undefined && (typeof params.expected_build !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(params.expected_build))) fail("expected_build must be an observed database build label");
  const { expected_build, ...upstream } = params;
  if (path === "/protein/in-pathway") {
    if (!body || typeof body !== "object" || Array.isArray(body)) fail("Pathway POST body must be a JSON object");
    const input = object(body);
    if (Object.keys(input).some(key => key !== "uniprot_id_list") || !Array.isArray(input.uniprot_id_list) || !input.uniprot_id_list.length || input.uniprot_id_list.length > 100 || input.uniprot_id_list.some(value => typeof value !== "string" || !/^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-[1-9][0-9]*)?$/.test(value))) fail("Body must contain only uniprot_id_list with 1–100 valid UniProt accessions");
  } else if (body !== undefined) fail("GET evidence operations do not accept a body");
  if (path === "/genetic-cor" || path === "/obs-cor") {
    text(upstream.trait, "trait"); upstream.cor_coef_threshold ??= 0.8;
    number(upstream.cor_coef_threshold, "cor_coef_threshold", -1, 1);
  } else if (path === "/pathway") {
    text(upstream.trait, "trait"); upstream.pval_threshold ??= 1e-5; number(upstream.pval_threshold, "pval_threshold");
  } else if (path === "/pqtl/") {
    text(upstream.query, "query"); choice(upstream.rtype, "rtype", ["simple", "mrres", "sglmr", "inst", "sense"]);
    choice(upstream.searchflag, "searchflag", ["proteins", "traits"]);
    upstream.pvalue ??= 0.5; number(upstream.pvalue, "pvalue");
  } else if (path === "/pqtl/pleio/") {
    if (typeof upstream.rsid !== "string" || !/^rs[1-9][0-9]*$/.test(upstream.rsid)) fail("rsid must be an exact rs identifier");
    choice(upstream.prflag, "prflag", ["count", "proteins"]);
  } else if (path === "/pqtl/list/") choice(upstream.flag, "flag", ["exposures", "outcomes"]);
  return { upstream, expected_build, component: path.startsWith("/pqtl/") ? "pqtl" : "epigraphdb" };
}
