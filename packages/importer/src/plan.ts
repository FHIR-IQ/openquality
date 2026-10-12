import { parseHeader, parseIncludes, parseValueSets, stripRestrictedDisplays } from './cql.js'
import { librarySlug, normalizeVersion, packageId, slugFor } from './naming.js'
import { stripMeasureDisplays, type UpstreamMeasure } from './measure.js'
import type { LibraryPlan, PackagePlan, PackageRef } from './emit.js'

export interface ImportContext {
  upstream: string
  ref: string
  retrieved: string
}

export interface Skip {
  measure: string
  reason: string
}

export interface PlanResult {
  plan?: PackagePlan
  /** The rewritten CQL to write alongside the plan. */
  cql?: string
  /** The Measure resource to write, stripped of licensed display text. */
  measureJson?: string
  skipped?: Skip
}

/** The namespace seeded CMS-programme measures are published under. */
export const MEASURE_NAMESPACE = 'cms'

/** Maps a CQL `using` declaration to an Open Quality dataModel value. */
function dataModelFor(model: string | undefined): string | undefined {
  if (model === 'QICore') return 'qi-core'
  if (model === 'FHIR') return 'fhir-r4'
  return undefined
}

/**
 * Plans one measure package, or explains why it cannot be planned. Fail-closed
 * on purpose: a measure that cannot be mapped is reported, never guessed at.
 * Silent truncation would read as complete coverage.
 */
/**
 * Every library this CQL includes, transitively. Returned in a stable sorted
 * order so the importer's output is deterministic and the CI drift check does
 * not fire on ordering alone.
 *
 * A library that is included but missing from `available` is left out rather
 * than guessed at; the caller turns that into a skip.
 */
export function resolveLibraries(
  cqlSource: string,
  available: Map<string, string>,
): { resolved: string[]; missing: string[] } {
  const resolved = new Set<string>()
  const missing = new Set<string>()
  const queue = parseIncludes(cqlSource).map((i) => i.library)

  while (queue.length > 0) {
    const name = queue.shift() as string
    if (resolved.has(name) || missing.has(name)) continue
    const source = available.get(name)
    if (!source) {
      missing.add(name)
      continue
    }
    resolved.add(name)
    for (const include of parseIncludes(source)) queue.push(include.library)
  }

  return { resolved: [...resolved].sort(), missing: [...missing].sort() }
}

export function planPackage(
  measure: UpstreamMeasure,
  cqlSource: string,
  context: ImportContext,
  measureJson = '',
): PlanResult {
  const skip = (reason: string): PlanResult => ({ skipped: { measure: measure.name, reason } })

  const version = normalizeVersion(measure.version)
  if (!version) return skip(`no parseable version, upstream had "${measure.version ?? 'nothing'}"`)

  if (!measure.title) return skip('no title on the upstream Measure resource')
  if (!measure.description) {
    return skip('no description on the upstream Measure resource, so Intent cannot be generated')
  }

  const header = parseHeader(cqlSource)
  if (!header) return skip('the CQL declares no library header')

  const dataModel = dataModelFor(header.model)
  if (!dataModel) {
    return skip(`the CQL declares an unmapped data model, "${header.model ?? 'none'}"`)
  }

  const { cql, removed } = stripRestrictedDisplays(cqlSource)
  const measureResource = stripMeasureDisplays(measureJson)

  const slug = slugFor(measure.title)

  const modifications: string[] = []
  if (removed.length > 0) {
    modifications.push(
      `removed licensed display text from ${removed.length} code ` +
        `${removed.length === 1 ? 'declaration' : 'declarations'} in the CQL: ${removed.join(', ')}`,
    )
  }
  if (measureResource.removed.length > 0) {
    const n = measureResource.removed.length
    modifications.push(
      `removed licensed display text from ${n} ${n === 1 ? 'coding' : 'codings'} in the ` +
        `Measure resource: ${measureResource.removed.join(', ')}`,
    )
  }

  const plan: PackagePlan = {
    id: packageId(MEASURE_NAMESPACE, slug),
    version,
    slug,
    title: measure.title,
    description: measure.description,
    steward: measure.steward,
    identifiers: measure.identifiers,
    measurementPeriod: measure.measurementPeriod,
    dataModel,
    cqlFileName: `${header.name}.cql`,
    measureFileName: `Measure-${measure.name}.json`,
    dependencies: [],
    valueSets: parseValueSets(cqlSource),
    provenance: {
      upstream: context.upstream,
      ref: context.ref,
      retrieved: context.retrieved,
      // Both the CQL and the Measure resource carry the same licensed
      // descriptors, and both are stripped, so either one makes the package
      // derived. They are reported as separate modifications because they are
      // separate files: a reader checking the claim needs to know which.
      relationship: modifications.length > 0 ? 'derived' : 'unmodified',
      modifications: modifications.length > 0 ? modifications : undefined,
    },
  }

  return { plan, cql, measureJson: measureResource.json }
}

/**
 * The library packages a piece of CQL includes directly, as manifest
 * dependencies. The version is the included library's own header version,
 * normalized the way package versions are. An include missing from `available`
 * is left out; the caller has already turned that into a skip.
 */
export function directDependencies(cqlSource: string, available: Map<string, string>): PackageRef[] {
  const refs = new Map<string, PackageRef>()
  for (const include of parseIncludes(cqlSource)) {
    const source = available.get(include.library)
    const version = normalizeVersion(source ? parseHeader(source)?.version : undefined)
    if (!version) continue
    const id = packageId(MEASURE_NAMESPACE, librarySlug(include.library))
    refs.set(id, { id, version })
  }
  return [...refs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export interface LibraryPlanResult {
  plan?: LibraryPlan
  /** The CQL to write, stripped of licensed display text. */
  cql?: string
  skipped?: Skip
}

/**
 * Plans one shared library as its own package. Fail-closed like planPackage:
 * a library whose identity or data model cannot be read is reported, and every
 * measure that reaches it is then skipped too.
 */
export function planLibrary(
  name: string,
  available: Map<string, string>,
  context: ImportContext,
  includedBy: string[],
): LibraryPlanResult {
  const skip = (reason: string): LibraryPlanResult => ({ skipped: { measure: name, reason } })
  const source = available.get(name)
  if (source === undefined) return skip('library not present upstream')

  const header = parseHeader(source)
  if (!header?.version) return skip('the CQL declares no library header with a version')
  const version = normalizeVersion(header.version)
  if (!version) return skip(`library version "${header.version}" is not a dotted numeric version`)
  const dataModel = dataModelFor(header.model)
  if (!dataModel) return skip(`the CQL declares an unmapped data model, "${header.model ?? 'none'}"`)

  const { cql, removed } = stripRestrictedDisplays(source)
  const slug = librarySlug(name)
  const modifications =
    removed.length > 0
      ? [
          `removed licensed display text from ${removed.length} code ` +
            `${removed.length === 1 ? 'declaration' : 'declarations'} in the CQL: ${removed.join(', ')}`,
        ]
      : undefined

  return {
    cql,
    plan: {
      id: packageId(MEASURE_NAMESPACE, slug),
      version,
      slug,
      name,
      cqlVersion: header.version,
      dataModel,
      cqlFileName: `${name}.cql`,
      valueSets: parseValueSets(source),
      dependencies: directDependencies(source, available),
      includedBy: [...includedBy].sort(),
      provenance: {
        upstream: context.upstream,
        ref: context.ref,
        retrieved: context.retrieved,
        relationship: modifications ? 'derived' : 'unmodified',
        modifications,
      },
    },
  }
}
