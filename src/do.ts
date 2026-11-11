import {RestStagingDO} from "@bio-mcp/shared/staging/rest-staging-do";
import type {SchemaHints} from "@bio-mcp/shared/staging/schema-inference";
import {flattenObject} from "@bio-mcp/shared/staging/schema-inference";
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const row=(value:unknown)=>({...record(value)?{...flattenObject(value,2),...Object.fromEntries(Object.entries(value).map(([key,item])=>[key,item!==null&&typeof item==="object"?JSON.stringify(item):item]))}:{value},native_json:JSON.stringify(value)});
export class EpiGraphDbDataDO extends RestStagingDO{
  protected getTabularData(value:unknown):unknown{
    const data=record(value)&&Array.isArray(value.content)&&record(value.structuredContent)&&"data" in value.structuredContent?value.structuredContent.data:value;
    if(Array.isArray(data))return {results:data.map(row)};
    if(!record(data))return data;
    if(typeof data.sql==="string"&&Array.isArray(data.rows))return {query_rows:data.rows.map(row)};
    if(Array.isArray(data.results))return {
      results:data.results.map(row),
      // Both keys are recognized by shared wrapper detection; an arbitrary sibling key would be omitted.
      records:[{kind:"evidence_context",native_json:JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key])=>key!=="results")))}],
    };
    if(typeof data.results==="number")return {count_observations:[{count:data.results}],evidence_context:[{native_json:JSON.stringify(data)}]};
    if(Array.isArray(data.advertised_operations))return {
      advertised_operations:data.advertised_operations.map(row),
      coverage_context:[{native_json:JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key])=>key!=="advertised_operations")))}],
    };
    return data;
  }
  protected getSchemaHints():SchemaHints{
    return {columnTypes:{native_json:"TEXT",trait:"TEXT",assoc_trait:"TEXT",gc:"TEXT",obs_cor:"TEXT",gwas:"TEXT",gwas_to_variant:"TEXT",variant:"TEXT",gene:"TEXT",protein:"TEXT",pathway:"TEXT",pathway_reactome_id:"TEXT",operation:"TEXT",expID:"TEXT",outID:"TEXT",outID_mrbase:"TEXT",rsID:"TEXT",uniprot_id:"TEXT",trait_id:"TEXT",assoc_trait_id:"TEXT",gwas_id:"TEXT",pathway_id:"TEXT",protein_uniprot_id:"TEXT"}};
  }
}
