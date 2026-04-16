#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 EpiGraphDB Structured Content Regression Tests${RESET}`);

const codeModeContent = readFile('src/tools/code-mode.ts');
assertContains('src/tools/code-mode.ts', codeModeContent, 'createSearchTool', 'code-mode.ts wires createSearchTool');
assertContains('src/tools/code-mode.ts', codeModeContent, 'createExecuteTool', 'code-mode.ts wires createExecuteTool');
assertContains('src/tools/code-mode.ts', codeModeContent, 'prefix: "epigraphdb"', 'code-mode.ts uses epigraphdb prefix');

const queryContent = readFile('src/tools/query-data.ts');
assertContains('src/tools/query-data.ts', queryContent, 'createQueryDataHandler', 'query-data.ts uses shared handler');
assertContains('src/tools/query-data.ts', queryContent, 'epigraphdb_query_data', 'query-data.ts registers epigraphdb_query_data');

const schemaContent = readFile('src/tools/get-schema.ts');
assertContains('src/tools/get-schema.ts', schemaContent, 'createGetSchemaHandler', 'get-schema.ts uses shared handler');
assertContains('src/tools/get-schema.ts', schemaContent, 'epigraphdb_get_schema', 'get-schema.ts registers epigraphdb_get_schema');

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'EpiGraphDbDataDO', 'index.ts exports EpiGraphDbDataDO');
assertContains('src/index.ts', indexContent, 'McpAgent', 'index.ts uses McpAgent');

const catalogContent = readFile('src/spec/catalog.ts');
assertContains('src/spec/catalog.ts', catalogContent, 'epigraphdbCatalog', 'catalog exports epigraphdbCatalog');
assertContains('src/spec/catalog.ts', catalogContent, 'https://api.epigraphdb.org', 'catalog uses epigraphdb base URL');
assertContains('src/spec/catalog.ts', catalogContent, '/ping', 'catalog includes connectivity ping endpoint');
assertContains('src/spec/catalog.ts', catalogContent, 'mendelian_randomization', 'catalog includes MR category');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ EpiGraphDB structured content regression tests passed.${RESET}`);
