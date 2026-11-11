import {afterEach,expect,it,vi} from "vitest";
import {epigraphdbRead} from "./http";
import {createEpiGraphDbApiFetch} from "./api-adapter";
import native from "./native-evidence.fixture.json";
const api=createEpiGraphDbApiFetch();
const builds=native.find(r=>r.url.endsWith("/builds"))!.data;
const cases=native.filter(r=>r.status===200&&[/\/genetic-cor\?/,/\/obs-cor\?/,/\/pathway\?/,/\/protein\/in-pathway$/,/\/pqtl\//].some(pattern=>pattern.test(r.url)));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it.each(cases)("accepts captured native evidence with null count metadata and distinct products $url",async row=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json(builds)).mockResolvedValueOnce(Response.json(row.data)).mockResolvedValueOnce(Response.json(builds)));
  const url=new URL(row.url);const params=Object.fromEntries(url.searchParams) as Record<string,unknown>;
  for(const key of ["cor_coef_threshold","pval_threshold","pvalue"])if(params[key]!==undefined)params[key]=Number(params[key]);
  const result=await api({method:url.pathname==="/protein/in-pathway"?"POST":"GET",path:url.pathname,params,...(url.pathname==="/protein/in-pathway"?{body:{uniprot_id_list:["O14933","O60674","P32455"]}}:{})});
  expect(result.data).toMatchObject(row.data);
  expect(result.completeness).toMatchObject({complete:false,returned:typeof row.data==="object"&&row.data&&"results" in row.data&&Array.isArray(row.data.results)?row.data.results.length:1});
});
it.each([-1,1.5,{},[],"3"])("rejects invalid count representations without losing them %#",async results=>{
  const source={metadata:null,results};
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json(builds)).mockResolvedValueOnce(Response.json(source)));
  await expect(api({method:"GET",path:"/pqtl/pleio/",params:{rsid:"rs1260326",prflag:"count"}})).rejects.toMatchObject({status:502,data:{observations:[{data:builds},{data:source}]}});
});
it("retains every observed build and source result on mid-read build drift",async()=>{
  const source={metadata:{empty_results:true},results:[]};const after={...builds as object,pqtl:"4.0"};
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json(builds)).mockResolvedValueOnce(Response.json(source)).mockResolvedValueOnce(Response.json(after)));
  await expect(api({method:"GET",path:"/pqtl/list/",params:{flag:"outcomes"}})).rejects.toMatchObject({status:409,data:{observations:[{data:builds},{data:source},{data:after}]}});
});
it("keeps complete error evidence and rejects partial and invalid representations",async()=>{
  for(const [status,body,type] of [[422,'{"detail":"native '+"α".repeat(18000)+'"}',"application/json"],[206,'{"metadata":{},"results":[]}',"application/json"],[200,"<html>upstream failure</html>","text/html"],[200,"broken JSON","application/json"]] as const){
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(body,{status,headers:{"Content-Type":type}})));
    await expect(epigraphdbRead("/mr")).rejects.toMatchObject({status:status===422?422:502,data:{raw_body:body,receipt:{bytes:new TextEncoder().encode(body).length,response_sha256:expect.stringMatching(/^[a-f0-9]{64}$/)}}});
  }
});
it("bounds fetch and body reads independently, even if abort is ignored",async()=>{
  vi.useFakeTimers();vi.stubGlobal("fetch",vi.fn(()=>new Promise(()=>{})));
  const waiting=expect(epigraphdbRead("/builds",{},"GET",undefined,Date.now()+20)).rejects.toMatchObject({status:504,data:{body_unavailable:true}});
  await vi.advanceTimersByTimeAsync(25);await waiting;
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(new ReadableStream({pull(){}}),{headers:{"Content-Type":"application/json"}})));
  const stalled=expect(epigraphdbRead("/builds",{},"GET",undefined,Date.now()+30)).rejects.toMatchObject({status:504,data:{body_unavailable:true}});
  await vi.advanceTimersByTimeAsync(35);await stalled;
});
it("supports inline evidence parameters without bypassing guards and native repeated arrays",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json(builds)).mockResolvedValueOnce(Response.json({metadata:{empty_results:true},results:[]})).mockResolvedValueOnce(Response.json(builds)));
  await api({method:"GET",path:"/genetic-cor?trait=missing&cor_coef_threshold=0.8&expected_build=1.0"});
  expect(String(vi.mocked(fetch).mock.calls[1][0])).not.toContain("expected_build");
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({metadata:{},results:[]})));
  await api({method:"GET",path:"/literature/gwas?semmed_predicates=CAUSES&semmed_predicates=TREATS",params:{trait:"asthma"}});
  expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.getAll("semmed_predicates")).toEqual(["CAUSES","TREATS"]);
  await expect(api({method:"GET",path:"/genetic-cor?trait=X&trait=Y"})).rejects.toThrow("Duplicate");
  await expect(api({method:"GET",path:"/%2e%2e/builds"})).rejects.toThrow("relative");
});
