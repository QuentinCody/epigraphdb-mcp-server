import {decodeResponseText,readResponseBytes} from "@bio-mcp/shared/http/response-reader";
import {fail} from "./response";
const EPIGRAPHDB_BASE="https://api.epigraphdb.org";
export async function epigraphdbRead(path:string,params:Record<string,unknown>={},method="GET",body?:unknown,deadline=Date.now()+45000){
  const { url, remaining, serialized } = prepareEpiGraphRequest(path, method, body, params, deadline);
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error("EpiGraphDB header deadline exceeded"),{status:504,data:{source_url:url.href,body_unavailable:true}}));},remaining);});
  try{
    const { raw, response, receipt } = await readEpiGraphEvidence(url, method, serialized, controller, timeout, deadline);
    let text: string;
    try{text=decodeResponseText(raw,"EpiGraphDB");}catch{throw Object.assign(new Error("Invalid EpiGraphDB UTF-8"),{status:response.ok?502:response.status,data:{receipt,body_unavailable:true}});}
    const invalid=(message:string,status=502):never=>{throw Object.assign(new Error(message),{status,data:{receipt,raw_body:text,retry_after:response.headers.get("retry-after")}});};
    if(response.status!==200||response.headers.has("content-range"))invalid(response.ok?"Partial EpiGraphDB response":`EpiGraphDB HTTP ${response.status}`,response.ok?502:response.status);
    if(!receipt.content_type?.includes("json"))invalid("Expected EpiGraphDB JSON");
    let data:unknown;try{data=JSON.parse(text.replace(/^\uFEFF/,""));}catch{invalid("Invalid EpiGraphDB JSON");}
    return {data,receipt};
  }finally{if(timer!==undefined)clearTimeout(timer);controller.abort();}
}

function prepareEpiGraphRequest(path: string, method: string, body: unknown, params: Record<string, unknown>, deadline: number) {
  if (!/^\/[a-zA-Z0-9/_-]*(?:\.json)?$/.test(path) || path.startsWith("//")) fail("Expected a relative EpiGraphDB path");
  if (!["GET", "POST"].includes(method) || (method === "GET" && body !== undefined)) fail("EpiGraphDB adapter supports read-only GET and query POST", 405);
  const url = new URL(EPIGRAPHDB_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!["string", "number", "boolean"].includes(typeof item) || String(item).length > 2000) fail("Unsupported EpiGraphDB query value");
      url.searchParams.append(key, String(item));
    }
  }
  const serialized = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  if (serialized && new TextEncoder().encode(serialized).length > 100000) fail("EpiGraphDB query body exceeds 100KB");
  const remaining = deadline - Date.now(); if (remaining <= 0) fail("EpiGraphDB HTTP budget exceeded", 504);
  return { url, remaining, serialized };
}

async function readEpiGraphEvidence(url: URL, method: string, serialized: string | undefined, controller: AbortController, timeout: Promise<never>, deadline: number) {
  const response = await Promise.race([fetch(url, { method, headers: { Accept: "application/json", ...(serialized ? { "Content-Type": "application/json" } : {}) }, body: serialized, signal: controller.signal, redirect: "manual" }).catch(() => { throw Object.assign(new Error("EpiGraphDB network request failed"), { status: 502, data: { source_url: url.href, body_unavailable: true } }); }), timeout]);
  let raw: Uint8Array;
  try { raw = await readResponseBytes(response, { label: "EpiGraphDB", maxBytes: 2 * 1024 * 1024, timeoutMs: Math.min(10000, deadline - Date.now()) }); }
  catch (error) { throw Object.assign(new Error("EpiGraphDB response could not be read completely within 2MiB/body deadline"), { status: response.ok && error && typeof error === "object" && "status" in error ? error.status : response.ok ? 502 : response.status, data: { source_url: url.href, http_status: response.status, body_unavailable: true, cause: String(error) } }); }
  const digest = await crypto.subtle.digest("SHA-256", raw);
  const receipt = { source_url: url.href, method, retrieved_at: new Date().toISOString(), http_status: response.status, content_type: response.headers.get("content-type"), bytes: raw.length, response_sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") };
  return { raw, response, receipt };
}
