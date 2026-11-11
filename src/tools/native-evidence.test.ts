import {afterEach,expect,it,vi} from "vitest";
vi.mock("cloudflare:workers",()=>({RpcTarget:class {},DurableObject:class {constructor(public ctx:unknown,public env:unknown){}}}));
import {canonicalJson,verifyCitationEnvelope} from "@bio-mcp/shared";
import {createHash} from "node:crypto";
import {fixture,recover} from "./staging-fixture";
import native from "../lib/native-evidence.fixture.json";
const builds=native.find(r=>r.url.endsWith("/builds"))!.data;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function invoke(f:ReturnType<typeof fixture>,name:string,args:unknown,failed=false){
  const result=await f.tools[name].handler(args,{});
  expect(result.isError===true,JSON.stringify(result).slice(0,1000)).toBe(failed);
  const sc=result.structuredContent;let original=sc;let materialized:unknown;
  if(sc.staged){const full=await recover(f,sc.data_access_id,"");materialized=full;original=full.structuredContent;}
  let data=original.data;
  if(data?.__staged){data=await recover(f,data.data_access_id,"");materialized??=data;}
  const proof=await verifyCitationEnvelope({citation:sc._meta.citation,structuredContent:sc,toolArguments:args,...(materialized?{materialized:{value:materialized}}:{})});
  expect(proof.verification).toMatchObject({query:"verified",result:"verified"});
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(30720);
  return {sc,data,id:original.data?.data_access_id??sc.data_access_id};
}
it.each(["","mcp_"])("preserves signed source rows, legacy columns and complete native JSON through %s SQLite",async prefix=>{
  const f=fixture();const source=native.find(r=>r.url.includes('/genetic-cor?')&&r.url.includes('0.5'))!.data;
  const payload={...source as object,future:{opaque:["0001",null,0],text:"α😀".repeat(7000)}};
  vi.stubGlobal("fetch",vi.fn(async url=>Response.json(String(url).endsWith('/builds')?builds:payload)));
  try{
    const result=await invoke(f,prefix+"epigraphdb_execute",{code:'return await api.get("/genetic-cor",{trait:"Waist circumference",cor_coef_threshold:0.5});'});
    expect(result.data).toMatchObject(payload);expect(result.sc._meta.completeness).toMatchObject({complete:false,returned:4});
    const {_epigraphdb,...recoveredProvider}=result.data;
    expect(_epigraphdb.response_sha256).toBe(createHash("sha256").update(canonicalJson(recoveredProvider)).digest("hex"));
    expect(_epigraphdb.hash_scope).toContain("canonical JSON");
    const schema=await invoke(f,prefix+"epigraphdb_get_schema",{data_access_id:result.id});
    expect(Object.keys(schema.data.schema.tables)).toEqual(expect.arrayContaining(["results","records","payloads"]));
    const sql=await invoke(f,prefix+"epigraphdb_query_data",{data_access_id:result.id,sql:"SELECT trait_id,assoc_trait_id,gc_rg,gc,native_json,typeof(trait_id) AS id_type FROM results ORDER BY _rowid"});
    expect(sql.data.rows.map((r:any)=>JSON.parse(r.native_json))).toEqual(result.data.results);
    expect(sql.data.rows.map((r:any)=>r.gc_rg)).toEqual(result.data.results.map((r:any)=>r.gc.rg));
    expect(sql.data.rows.some((r:any)=>r.gc_rg<0)).toBe(true);expect(sql.data.rows.every((r:any)=>r.id_type==="text")).toBe(true);
    expect(sql.data.rows.map((r:any)=>JSON.parse(r.gc))).toEqual(result.data.results.map((r:any)=>r.gc));
  }finally{f.close();}
});
it("retains native pathway arrays and count observations without flattening them into fake records",async()=>{
  const f=fixture();const source=native.find(r=>r.url.endsWith('/protein/in-pathway'))!.data;
  let payload={...source as object,future:"α".repeat(22000)};
  vi.stubGlobal("fetch",vi.fn(async url=>Response.json(String(url).endsWith('/builds')?builds:payload)));
  try{
    const result=await invoke(f,"epigraphdb_execute",{code:'return await api.post("/protein/in-pathway",{uniprot_id_list:["O14933","O60674","P32455"]});'});
    const rows=await invoke(f,"epigraphdb_query_data",{data_access_id:result.id,sql:"SELECT uniprot_id,pathway_count,pathway_reactome_id FROM results ORDER BY _rowid"});
    expect(rows.data.rows.map((r:any)=>JSON.parse(r.pathway_reactome_id))).toEqual(result.data.results.map((r:any)=>r.pathway_reactome_id));
    payload={metadata:null,results:3,future:"α".repeat(22000)} as typeof payload;
    const count=await invoke(f,"mcp_epigraphdb_execute",{code:'return await api.get("/pqtl/pleio/",{rsid:"rs1260326",prflag:"count"});'});
    expect(count.data).toMatchObject({metadata:null,results:3});expect(count.sc._meta.completeness).toMatchObject({complete:false,returned:1});
    const countRows=await invoke(f,"mcp_epigraphdb_query_data",{data_access_id:count.id,sql:"SELECT count FROM count_observations"});
    expect(countRows.data.rows).toEqual([{count:3}]);
  }finally{f.close();}
});
it("retains complete provider errors and all prior native observations on rejection",async()=>{
  const f=fixture();const text="native error "+"α".repeat(22000);
  try{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(text,{status:503})));
    const failed=await invoke(f,"epigraphdb_execute",{code:'return await api.get("/mr",{exposure_trait:"missing"});'},true);
    const error=failed.data.data.__staged?await recover(f,failed.data.data.data_access_id,""):failed.data.data;
    expect(error.upstream_error.raw_body).toBe(text);expect(error.upstream_error.receipt.http_status).toBe(503);
    vi.mocked(fetch).mockImplementation(async()=>Response.json(builds));
    const conflict=await invoke(f,"mcp_epigraphdb_execute",{code:'return await api.get("/pqtl/list/",{flag:"exposures",expected_build:"2.0"});'},true);
    expect(conflict.data.status).toBe(409);expect(conflict.data.data.observations[0].data).toEqual(builds);
  }finally{f.close();}
});
it("verifies citations on every tool alias and failure",async()=>{
  const f=fixture();
  try{
    expect(Object.keys(f.tools).sort()).toEqual(["search","execute","query_data","get_schema"].flatMap(name=>["epigraphdb_"+name,"mcp_epigraphdb_"+name]).sort());
    for(const prefix of ["","mcp_"]){
      await invoke(f,prefix+"epigraphdb_search",{query:"pqtl",max_results:3});
      await invoke(f,prefix+"epigraphdb_query_data",{data_access_id:"missing",sql:"SELECT * FROM missing"},true);
      await invoke(f,prefix+"epigraphdb_get_schema",{data_access_id:"missing"});
      await invoke(f,prefix+"epigraphdb_execute",{code:""},true);
    }
  }finally{f.close();}
});
