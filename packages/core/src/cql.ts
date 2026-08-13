/**
 * Reading identity out of CQL source text.
 *
 * This lives in core rather than in the importer because two packages now need
 * it and the dependency direction only allows one of them to reach the other.
 * The importer parses headers to plan an import; the FHIR package emitter
 * parses them to name a Library resource and to state what it depends on.
 * core already parses CQL text in terminology.ts, so this is where it belongs.
 *
 * Regexes over source rather than a parse, for the same reason terminology.ts
 * gives: Level 1 does not require translation, so a file that is close to valid
 * CQL but not quite still has to be readable here.
 */

export interface CqlHeader {
  name: string
  version: string
  model?: string
  modelVersion?: string
}

export interface CqlInclude {
  library: string
  version: string
  alias?: string
}

const LIBRARY = /^library\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'/m
const USING = /^using\s+([A-Za-z0-9_]+)(?:\s+version\s+'([^']+)')?/m
const INCLUDE = /^include\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'(?:\s+called\s+([A-Za-z0-9_]+))?/gm

export function parseHeader(cql: string): CqlHeader | undefined {
  const library = cql.match(LIBRARY)
  if (!library) return undefined
  const using = cql.match(USING)
  return { name: library[1], version: library[2], model: using?.[1], modelVersion: using?.[2] }
}

export function parseIncludes(cql: string): CqlInclude[] {
  return [...cql.matchAll(INCLUDE)].map((m) => ({ library: m[1], version: m[2], alias: m[3] }))
}
