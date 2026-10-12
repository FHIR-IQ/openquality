import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CorpusSource } from './source.js'
import { getArtifact, getBundle, getMeasure, knownIssues, searchMeasures } from './tools.js'

export const SERVER_NAME = 'openquality'
export const SERVER_VERSION = '0.2.0'

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const
const id = z.string().min(1).max(200).describe('Package id, for example cms/diabetes-glycemic-status-assessment-greater-than-9')
const limit = z.number().int().min(1).max(50).optional().describe('Maximum results, default 20')

const INSTRUCTIONS = `Open Quality is an open corpus of healthcare quality measures: CQL, SQL and SQL-on-FHIR \
packages with verified provenance, plus a typed record of what implementers learned about each measure. \
Start with search_measures, then get_measure for provenance and the file list, get_artifact for code, \
known_issues before writing or reviewing logic, and get_bundle to load a measure into CRMI-aware tooling. \
Everything is read-only and served from the commit named in each result.`

/** The MCP server over one corpus source. Transport-independent. */
export function createServer(source: CorpusSource): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'search_measures',
    {
      title: 'Search measures',
      description:
        'Find measure packages by CMS id, title words, steward or package id. Every word must match. ' +
        'Shared CQL libraries are packages too; pass kind "library" to search them.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('Words to match, for example "CMS122" or "diabetes glycemic"'),
        collection: z.string().max(100).optional().describe('Limit to a collection, for example cms-fhir-2026 or community'),
        dataModel: z.string().max(50).optional().describe('Limit to a data model, for example qi-core or sql-on-fhir'),
        kind: z
          .enum(['measure', 'library', 'any'])
          .optional()
          .describe('measure (default), library for shared CQL libraries such as FHIRHelpers, or any'),
        limit,
      },
      annotations: READ_ONLY,
    },
    (input) => searchMeasures(source, input),
  )

  server.registerTool(
    'get_measure',
    {
      title: 'Get measure',
      description:
        'A package: title, steward, license, provenance (upstream commit, unmodified or derived, and exactly what changed), value set references, file list and known issue summaries.',
      inputSchema: { id },
      annotations: READ_ONLY,
    },
    (input) => getMeasure(source, input),
  )

  server.registerTool(
    'get_artifact',
    {
      title: 'Get artifact',
      description: 'The raw text of one file a package lists: CQL, SQL, a ViewDefinition, or a FHIR Measure.',
      inputSchema: { path: z.string().min(1).max(500).describe('A path from get_measure `artifacts`') },
      annotations: READ_ONLY,
    },
    (input) => getArtifact(source, input),
  )

  server.registerTool(
    'get_bundle',
    {
      title: 'Get CRMI Bundle',
      description:
        "The package as a CRMI artifact Bundle, the shape CRMI's $package returns: an asset-collection Library, then the Measure, its Library and every shared library it depends on.",
      inputSchema: { id },
      annotations: READ_ONLY,
    },
    (input) => getBundle(source, input),
  )

  server.registerTool(
    'known_issues',
    {
      title: 'Known issues',
      description:
        'Interpretation issues, defects, test cases and implementation notes, with their full text. Read these before writing or reviewing measure logic.',
      inputSchema: {
        measure: id.optional(),
        type: z.string().max(50).optional().describe('interpretation-issue, defect, test-case or implementation-note'),
        status: z.string().max(50).optional().describe('open or resolved'),
        limit,
      },
      annotations: READ_ONLY,
    },
    (input) => knownIssues(source, input),
  )

  return server
}
