import type {Completeness} from "@bio-mcp/shared";
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const scope=(returned?:number):Completeness=>({complete:false,...(returned===undefined?{}:{returned}),truncation:{reason:"unknown",detail:"One EpiGraphDB response or build advertisement, not exhaustive source coverage or an immutable snapshot. Counts, correlation, membership and MR are distinct observations.",remedy:"Retain native query, component/builds, exact identifiers and independent evidence products. Do not infer absence or causality from returned rows."}});
export function epigraphdbCompleteness(value:unknown):Completeness{
  if(Array.isArray(value))return scope(value.length);
  if(!record(value))return scope();
  if(value.__staged===true&&record(value._staging)&&record(value._staging.completeness))return {...value._staging.completeness,complete:false};
  if(Array.isArray(value.results))return scope(value.results.length);
  if(typeof value.results==="number")return scope(1);
  return scope();
}
