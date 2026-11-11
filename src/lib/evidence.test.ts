import { afterEach, expect, it, vi } from "vitest";
import { createEpiGraphDbApiFetch } from "./api-adapter";
const api = createEpiGraphDbApiFetch();
const builds = { epigraphdb: { overall: "1.0", database: "1.0", api: "1.0", web_app: null }, pqtl: "3.0" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const envelope = (results: unknown[]) => ({ metadata: { empty_results: results.length === 0, query: "provider query", total_seconds: 0.2 }, results });
const correlation = { trait: { id: "ukb-a-382", trait: "Waist circumference" }, assoc_trait: { id: "ukb-a-287", trait: "Other trait" }, gc: { rg: -0.95, rg_SE: 0.003, p: 0, Z: -10, h2: 0.2, rg_intercept: null } };
function setup(payload: unknown, after: unknown = builds) {
  const fetcher = vi.fn().mockResolvedValueOnce(json(builds)).mockResolvedValueOnce(json(payload)).mockResolvedValueOnce(json(after));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
it("retains signed estimates, nulls, duplicates and full provider metadata with build provenance", async () => {
  const raw = envelope([correlation, correlation]); const fetcher = setup(raw);
  const result = await api({ method: "GET", path: "/genetic-cor", params: { trait: "Waist circumference", expected_build: "1.0" } });
  expect(result).toMatchObject({ data: { ...raw, _epigraphdb: { component: "epigraphdb", builds_before: builds, builds_after: builds, genome_assembly: null, source_data_release: null, response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } } });
  const url = new URL(String(fetcher.mock.calls[1][0]));
  expect(url.searchParams.get("cor_coef_threshold")).toBe("0.8"); expect(url.searchParams.has("expected_build")).toBe(false);
});
it("does not reinterpret a negative threshold as a negative-only filter", async () => {
  setup(envelope([{ ...correlation, gc: { rg: 0.2 } }]));
  await expect(api({ method: "GET", path: "/genetic-cor", params: { trait: "Waist circumference", cor_coef_threshold: -0.5 } })).resolves.toMatchObject({ status: 200 });
});
it("preserves observational correlations separately", async () => {
  const raw = envelope([{ trait: correlation.trait, assoc_trait: correlation.assoc_trait, obs_cor: { cor: -0.9 } }]); setup(raw);
  expect(await api({ method: "GET", path: "/obs-cor", params: { trait: "Waist circumference" } })).toMatchObject({ data: raw });
});
it("preserves the instrument-to-pathway chain and zero p-values", async () => {
  const raw = envelope([{ gwas: { id: "ieu-a-300", trait: "LDL cholesterol" }, gwas_to_variant: { pval: 0, beta: -0.4, se: 0.01, eaf: 0.03, samplesize: 139198 }, variant: { name: "rs7254892" }, gene: { name: "TOMM40" }, protein: { uniprot_id: "O96008" }, pathway: { id: "R-HSA-9663891", name: "Selective autophagy" } }]); setup(raw);
  expect(await api({ method: "GET", path: "/pathway", params: { trait: "LDL cholesterol" } })).toMatchObject({ data: raw });
});
it("uses native POST JSON for pathway membership", async () => {
  const fetcher = setup(envelope([{ uniprot_id: "O60674", pathway_count: 2, pathway_reactome_id: ["R-HSA-1", "R-HSA-2"] }]));
  await api({ method: "POST", path: "/protein/in-pathway", body: { uniprot_id_list: ["O60674"] } });
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ uniprot_id_list: ["O60674"] }) });
});
it.each(["simple", "mrres", "sglmr", "inst", "sense"])("retains pQTL %s products and uses the separate build", async rtype => {
  const raw = envelope([{ expID: "ADAM15", outID: "Trait", pvalue: 0, beta: -0.2, se: 0.05, nsnp: 1, method: "Wald ratio", trans_cis: "trans", coloc_prob: null, direction: "NA", steiger_pvalue: null, q_pvalue: null }]); setup(raw);
  expect(await api({ method: "GET", path: "/pqtl/", params: { query: "ADAM15", searchflag: "proteins", rtype, expected_build: "3.0" } })).toMatchObject({ data: { ...raw, _epigraphdb: { component: "pqtl", genome_assembly: null } } });
});
it.each(["exposures", "outcomes"])("preserves live pQTL %s list without fixed counts", async flag => {
  const raw = envelope([{ [flag === "exposures" ? "expID" : "outID"]: "provider entity" }]); setup(raw);
  expect(await api({ method: "GET", path: "/pqtl/list/", params: { flag } })).toMatchObject({ data: raw });
});
it("preserves count mode without fabricating individual proteins", async () => {
  const raw = {metadata:null,results:3}; setup(raw);
  expect(await api({ method: "GET", path: "/pqtl/pleio/", params: { rsid: "rs1260326", prflag: "count" } })).toMatchObject({ data: raw });
});
it("does not label empty evidence as absence of an association", async () => {
  setup(envelope([]));
  expect(await api({ method: "GET", path: "/pqtl/", params: { query: "ADAM15", searchflag: "proteins", rtype: "simple" } })).toMatchObject({ data: { results: [], _epigraphdb: { completeness: expect.stringContaining("do not prove absence") } } });
});
it.each([
  ["GET", "/genetic-cor", { trait: "X", limit: 10 }],
  ["GET", "/obs-cor", { trait: "X", cor_coef_threshold: 1.1 }],
  ["GET", "/pathway", { trait: "X", pval_threshold: -1 }],
  ["GET", "/pathway", { trait: "" }],
  ["POST", "/pathway", { trait: "X" }],
  ["GET", "/pqtl/", { query: "X", searchflag: "exposures", rtype: "simple" }],
  ["GET", "/pqtl/", { query: "X", searchflag: "proteins", rtype: "unknown" }],
  ["GET", "/pqtl/list/", { flag: "proteins" }],
  ["GET", "/pqtl/pleio/", { rsid: "chr1:1", prflag: "proteins" }],
  ["GET", "/pqtl/pleio/", { rsid: "rs123", prflag: "all" }],
  ["GET", "/pathway", { trait: "X", expected_build: 1 }],
])("rejects invalid parameters or invented pagination before networking %#", async (method, path, params) => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api({ method: method as string, path: path as string, params: params as Record<string, unknown> })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([{ uniprot_id_list: ["TP53"] }, { uniprot_id_list: [] }, { uniprot_id_list: Array(101).fill("P04637") }, { uniprot_id_list: ["P04637"], extra: true }])("rejects invalid protein bodies %#", async body => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api({ method: "POST", path: "/protein/in-pathway", body })).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it("rejects the wrong expected component build before data fetch", async () => {
  const fetcher = setup(envelope([]));
  await expect(api({ method: "GET", path: "/pqtl/list/", params: { flag: "exposures", expected_build: "1.0" } })).rejects.toMatchObject({ status: 409 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects mid-request build drift", async () => {
  setup(envelope([]), { ...builds, pqtl: "4.0" });
  await expect(api({ method: "GET", path: "/pqtl/list/", params: { flag: "exposures" } })).rejects.toMatchObject({ status: 409 });
});
it("does not assign an advertised/default build when /builds is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ epigraphdb: builds.epigraphdb, pqtl: null })));
  await expect(api({ method: "GET", path: "/pqtl/list/", params: { flag: "exposures" } })).rejects.toMatchObject({ status: 502 });
});
it.each([
  envelope([{ ...correlation, trait: { id: "X", trait: "different" } }]),
  envelope([{ ...correlation, gc: { rg: 0.7 } }]),
  envelope([{ ...correlation, gc: { rg: null } }]),
  { metadata: { empty_results: true }, results: [correlation] },
  { metadata: { empty_results: false }, results: [] },
  { detail: "failed", ...envelope([]) },
  { results: [] },
])("rejects inconsistent evidence rather than returning a successful partial result %#", async raw => {
  setup(raw);
  await expect(api({ method: "GET", path: "/genetic-cor", params: { trait: "Waist circumference" } })).rejects.toMatchObject({ status: 502 });
});
it("discovers live advertised operations while distinguishing advertisement from coverage", async () => {
  const operation = { parameters: [{ name: "query" }], responses: { "200": {} } };
  setup({ openapi: "3.0.2", info: { version: "1.0" }, paths: { "/pqtl/": { get: operation } }, components: { schemas: { fixture: { type: "object" } } } });
  const result = await api({ method: "GET", path: "/evidence/coverage" });
  expect(result).toMatchObject({ data: { builds_before: builds, advertised_operations: expect.arrayContaining([{ path: "/pqtl/", method: "GET", advertised: true, operation }, { path: "/pathway", method: "GET", advertised: false, operation: null }]), note: expect.stringContaining("not live query acceptance"), components: { schemas: { fixture: { type: "object" } } } } });
});
it("rejects oversized UTF-8 responses without truncating", async () => {
  setup(envelope([{ ...correlation, extra: "α".repeat(1_100_000) }]));
  await expect(api({ method: "GET", path: "/genetic-cor", params: { trait: "Waist circumference" } })).rejects.toThrow(/2MiB/);
});
it("retains existing PPI POST behavior", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(envelope([]))); vi.stubGlobal("fetch", fetcher);
  await api({ method: "POST", path: "/protein/ppi", body: { uniprot_id_list: ["P04637"] } });
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ uniprot_id_list: ["P04637"] }) });
});

it("does not treat a sensitivity statistic as the filtered MR p-value", async () => {
  const raw = envelope([{ expID: "ADAM15", pvalue: 0.9, heterogeneity: null }]); setup(raw);
  expect(await api({ method: "GET", path: "/pqtl/", params: { query: "ADAM15", searchflag: "proteins", rtype: "sense", pvalue: 1e-5 } })).toMatchObject({ data: raw });
});
