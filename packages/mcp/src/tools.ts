// Imported module by module rather than through core's index, so the server
// does not pull in the tarball packer and its dependencies.
import { buildPackageBundle, type CqlFile, type FhirResourceFile, type PackageDependency } from '../../core/src/fhir.js'
import { resolveDependencies } from '../../core/src/corpus.js'
import { parseManifest, type Manifest } from '../../core/src/manifest.js'
import { loadCatalogue, type Catalogue, type PackageEntry } from './catalogue.js'
import type { CorpusSource } from './source.js'

export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/**
 * Appended to every result. It is the reason to use this server over fetching
 * raw files: the terms the content is published under travel with the code into
 * the agent's context. Keep it in step with TERMINOLOGY.md.
 */
export function footer(ref: string, license?: string): string {
  return [
    `served-from: ${ref}`,
    ...(license ? [`license: ${license}`] : []),
    'policy: Value sets are referenced by OID or canonical URL, never embedded.',
    '        CPT display text is removed; codes and code systems are kept.',
    '        Repackaged copy, not an authoritative publication. See https://openquality.us/terminology',
  ].join('\n')
}

function ok(source: CorpusSource, payload: unknown, license?: string): ToolResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return { content: [{ type: 'text', text }, { type: 'text', text: footer(source.ref, license) }] }
}

function fail(source: CorpusSource, message: string): ToolResult {
  return { content: [{ type: 'text', text: message }, { type: 'text', text: footer(source.ref) }], isError: true }
}

/**
 * Findings, not exceptions, as in core: a handler reports a failed read or a
 * bad id as an error result the agent can act on, and never throws.
 */
async function guarded(source: CorpusSource, tool: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (err) {
    return fail(source, `${tool}: ${(err as Error).message}`)
  }
}

function summary(pkg: PackageEntry) {
  return {
    id: pkg.id,
    version: pkg.version,
    title: pkg.title,
    steward: pkg.steward,
    identifiers: pkg.identifiers,
    collection: pkg.collection,
    dataModel: pkg.dataModel,
    license: pkg.license,
    level: pkg.level,
    relationship: pkg.relationship,
    kind: pkg.kind ?? 'measure',
    knowledgeEntries: pkg.knowledge.length,
  }
}

function findPackage(catalogue: Catalogue, id: string): PackageEntry | undefined {
  return catalogue.packages.find((p) => p.id === id)
}

async function readManifest(source: CorpusSource, pkg: PackageEntry): Promise<Manifest> {
  const parsed = parseManifest(await source.readText(pkg.manifest))
  if (parsed.ok) return parsed.manifest
  // Narrowed with `in` rather than on `ok`, so it also compiles under the
  // non-strict settings Vercel's function builder applies to files outside site/.
  const detail = 'findings' in parsed ? parsed.findings[0]?.message ?? '' : ''
  throw new Error(`the manifest of ${pkg.id} does not parse: ${detail}`)
}

export interface SearchInput {
  query: string
  /** 'measure' by default, so results do not fill up with shared libraries. */
  kind?: 'measure' | 'library' | 'any'
  collection?: string
  dataModel?: string
  limit?: number
}

export function searchMeasures(source: CorpusSource, input: SearchInput): Promise<ToolResult> {
  return guarded(source, 'search_measures', async () => {
    const catalogue = await loadCatalogue(source)
    const tokens = input.query.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = catalogue.packages.filter((pkg) => {
      const kind = input.kind ?? 'measure'
      if (kind !== 'any' && (pkg.kind ?? 'measure') !== kind) return false
      if (input.collection && pkg.collection !== input.collection) return false
      if (input.dataModel && pkg.dataModel !== input.dataModel) return false
      const haystack = [pkg.id, pkg.title, pkg.steward ?? '', ...pkg.identifiers].join(' ').toLowerCase()
      return tokens.every((t) => haystack.includes(t))
    })
    const limit = input.limit ?? 20
    return ok(source, { total: matches.length, results: matches.slice(0, limit).map(summary) })
  })
}

export function getMeasure(source: CorpusSource, input: { id: string }): Promise<ToolResult> {
  return guarded(source, 'get_measure', async () => {
    const catalogue = await loadCatalogue(source)
    const pkg = findPackage(catalogue, input.id)
    if (!pkg) return fail(source, `get_measure: no package with id "${input.id}". Use search_measures to find one.`)
    const manifest = await readManifest(source, pkg)
    return ok(
      source,
      {
        ...summary(pkg),
        measure: manifest.measure,
        measurementPeriod: manifest.measurementPeriod,
        provenance: manifest.provenance,
        library: manifest.library,
        dependencies: manifest.dependencies ?? [],
        artifacts: pkg.artifacts,
        valueSets: manifest.valueSets ?? [],
        knowledge: catalogue.knowledge
          .filter((k) => k.measure === pkg.id)
          .map(({ id, title, type, status, measureVersion, summary: text, page }) => ({
            id, title, type, status, measureVersion, summary: text, page,
          })),
        files:
          'Read any path in `artifacts` with get_artifact. `dependencies` are shared library ' +
          'packages: get_measure on one gives its files. get_bundle returns the package and ' +
          'every dependency as one CRMI Bundle.',
      },
      pkg.license,
    )
  })
}

export function getArtifact(source: CorpusSource, input: { path: string }): Promise<ToolResult> {
  return guarded(source, 'get_artifact', async () => {
    const catalogue = await loadCatalogue(source)
    if (!catalogue.readable.has(input.path)) {
      return fail(
        source,
        `get_artifact: "${input.path}" is not a file the catalogue lists. ` +
          'Use a path from get_measure `artifacts`, or a knowledge entry `source`.',
      )
    }
    const owner = catalogue.packages.find((p) => input.path.startsWith(`${p.path}/`))
    return ok(source, await source.readText(input.path), owner?.license)
  })
}

export function getBundle(source: CorpusSource, input: { id: string }): Promise<ToolResult> {
  return guarded(source, 'get_bundle', async () => {
    const catalogue = await loadCatalogue(source)
    const pkg = findPackage(catalogue, input.id)
    if (!pkg) return fail(source, `get_bundle: no package with id "${input.id}". Use search_measures to find one.`)
    const manifest = await readManifest(source, pkg)
    // Built from the catalogue's artifact list. A test holds this equal to what
    // the CLI builds by walking directories, for every package.
    const { cql, resources } = await readArtifacts(source, pkg)

    // Shared libraries are dependencies, resolved transitively through the
    // catalogue, so the Bundle carries everything the measure needs, as
    // CRMI $package does.
    const byKey = new Map(catalogue.packages.map((p) => [`${p.id}@${p.version}`, p]))
    const lookup = (id: string, version: string) => {
      const found = byKey.get(`${id}@${version}`)
      return found && { manifest: { id: found.id, version: found.version, license: found.license, artifacts: [], dependencies: found.dependencies }, entry: found }
    }
    const { resolved, missing } = resolveDependencies(manifest, lookup)
    if (missing.length > 0) {
      return fail(source, `get_bundle: ${pkg.id} depends on packages not in the catalogue: ${missing.map((m) => `${m.id}@${m.version}`).join(', ')}`)
    }
    const dependencies: PackageDependency[] = []
    for (const dep of resolved) {
      dependencies.push({ manifest: await readManifest(source, dep.entry), files: (await readArtifacts(source, dep.entry)).cql })
    }
    return ok(source, buildPackageBundle(manifest, cql, resources, { license: manifest.license }, dependencies), pkg.license)
  })
}

async function readArtifacts(
  source: CorpusSource,
  pkg: PackageEntry,
): Promise<{ cql: CqlFile[]; resources: FhirResourceFile[] }> {
  const cql: CqlFile[] = []
  const resources: FhirResourceFile[] = []
  for (const artifact of pkg.artifacts) {
    const path = artifact.slice(pkg.path.length + 1)
    if (artifact.endsWith('.cql')) {
      cql.push({ path, source: await source.readText(artifact) })
    } else if (artifact.endsWith('.json')) {
      const parsed: unknown = JSON.parse(await source.readText(artifact))
      if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).resourceType === 'string') {
        resources.push({ path, resource: parsed as Record<string, unknown> })
      }
    }
  }
  return { cql, resources }
}

export interface KnownIssuesInput {
  measure?: string
  type?: string
  status?: string
  limit?: number
}

export function knownIssues(source: CorpusSource, input: KnownIssuesInput): Promise<ToolResult> {
  return guarded(source, 'known_issues', async () => {
    const catalogue = await loadCatalogue(source)
    const matches = catalogue.knowledge.filter(
      (k) =>
        (!input.measure || k.measure === input.measure) &&
        (!input.type || k.type === input.type) &&
        (!input.status || k.status === input.status),
    )
    const limit = input.limit ?? 20
    const entries = []
    for (const entry of matches.slice(0, limit)) {
      entries.push({ ...entry, body: await source.readText(entry.source) })
    }
    return ok(source, { total: matches.length, entries })
  })
}
