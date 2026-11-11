import type {ApiFetchFn} from "@bio-mcp/shared/codemode/catalog";
import {epigraphdbRead} from "./http";
import {coverage,evidence,type Read} from "./evidence";
import {evidencePaths} from "./evidence-request";
import {fail} from "./response";
import {epigraphdbCompleteness} from "./completeness";

export function createEpiGraphDbApiFetch():ApiFetchFn{
  return async request=>{
    const { path, method, params, read, observations }: { path: string; method: string; params: { [x: string]: unknown; }; read: Read; observations: { data: unknown; receipt: { source_url: string; method: string; retrieved_at: string; http_status: number; content_type: string | null; bytes: number; response_sha256: string; }; }[]; } = prepareEpiGraphRequest(request);
    try{
      let data:unknown;
      if(path==="/evidence/coverage"){
        if(method!=="GET"||request.body!==undefined)fail("Coverage discovery accepts GET without a body",405);
        data=await coverage(params,read);
      }else if(evidencePaths.includes(path))data=await evidence(path,method,params,request.body,read);
      else data=await read(path,params,method,request.body);
      if(data&&typeof data==="object"&&!Array.isArray(data)){
        const obj=data as Record<string,unknown>;
        data={...obj,_epigraphdb:{...(obj._epigraphdb as Record<string,unknown>|undefined),receipts:observations.map(item=>item.receipt)}};
      }
      return {status:200,data,completeness:epigraphdbCompleteness(data)};
    }catch(error){
      throw Object.assign(new Error(error instanceof Error?error.message:"EpiGraphDB request failed"),{status:error&&typeof error==="object"&&"status" in error?error.status:502,data:{observations,...(error&&typeof error==="object"&&"data" in error?{upstream_error:error.data}:{})}});
    }
  };
}

function prepareEpiGraphRequest(request: Parameters<ApiFetchFn>[0]) {
  const method = String(request.method || "GET").toUpperCase();
  if (!request.path.startsWith("/") || request.path.startsWith("//") || /[#\\]/.test(request.path) || /%(?:2e|2f|5c)/i.test(request.path.split("?")[0]) || request.path.split("?")[0].split("/").some(part => part === "." || part === "..")) fail("Expected a relative EpiGraphDB path");
  const parsed = new URL(request.path, "https://api.epigraphdb.org"); const path = parsed.pathname; const params = { ...request.params };
  for (const [key, value] of parsed.searchParams) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      if (["semmed_predicates", "semmantic_types"].includes(key) && !Object.prototype.hasOwnProperty.call(request.params ?? {}, key)) params[key] = [...[params[key]].flat(), value];
      else fail("Duplicate EpiGraphDB query parameter");
    } else params[key] = evidencePaths.includes(path) && ["cor_coef_threshold", "pval_threshold", "pvalue"].includes(key) ? Number(value) : value;
  }
  const deadline = Date.now() + 45000; const observations: Awaited<ReturnType<typeof epigraphdbRead>>[] = [];
  const read: Read = async (p, query, verb, body) => { const result = await epigraphdbRead(p, query, verb, body, deadline); observations.push(result); return result.data; };
  return { path, method, params, read, observations };
}
