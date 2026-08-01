import { parseHeader, parseIncludes, parseValueSets, stripRestrictedDisplays } from './cql.js'
import { normalizeVersion, packageId, slugFor } from './naming.js'
import type { UpstreamMeasure } from './measure.js'
import type { PackagePlan } from './emit.js'

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

  const slug = slugFor(measure.title)

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
    libraryFileNames: [],
    valueSets: parseValueSets(cqlSource),
    provenance: {
      upstream: context.upstream,
      ref: context.ref,
      retrieved: context.retrieved,
      relationship: removed.length > 0 ? 'derived' : 'unmodified',
      modifications:
        removed.length > 0
          ? [`removed licensed display text from ${removed.length} code declarations: ${removed.join(', ')}`]
          : undefined,
    },
  }

  return { plan, cql }
}
