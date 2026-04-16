# epigraphdb-mcp-server

MCP server wrapping [EpiGraphDB](https://api.epigraphdb.org) — MRC IEU's
integrated epidemiology graph (MR-Base, ontologies, literature mining,
gene-drug druggability, PPI networks).

- Upstream: `https://api.epigraphdb.org`
- Port: `8887`
- Tools: `epigraphdb_search`, `epigraphdb_execute`, `epigraphdb_query_data`, `epigraphdb_get_schema`

The catalog starts with connectivity-guard endpoints (`/ping`, `/builds`,
`/meta/api-endpoints`) and gives Mendelian Randomization its own category
since that is the differentiator of EpiGraphDB.

## Local dev

```bash
./scripts/dev-servers.sh epigraphdb
```
