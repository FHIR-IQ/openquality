import { policyFor } from '@openquality/core'

export interface UpstreamMeasure {
  name: string
  version?: string
  title?: string
  description?: string
  /** Measure.publisher. On this source it is the steward, and it is not CMS. */
  steward?: string
  identifiers: string[]
  measurementPeriod?: number
  /** The primary CQL library name, taken from the Measure.library canonical. */
  library?: string
  status?: string
}

interface Coding {
  code?: string
}
interface Identifier {
  type?: { coding?: Coding[] }
  system?: string
  value?: string
}
interface MeasureResource {
  resourceType?: string
  name?: string
  version?: string
  title?: string
  description?: string
  publisher?: string
  status?: string
  identifier?: Identifier[]
  effectivePeriod?: { start?: string }
  library?: string[]
}

const CMS_ID_SYSTEM = 'https://madie.cms.gov/measure/cmsId'
const SHORT_NAME_SYSTEM = 'https://madie.cms.gov/measure/shortName'

/**
 * Decodes the five basic HTML/XML entities. Upstream emits `publisher` as
 * both "Centers for Medicare &amp; Medicaid Services (CMS)" and "Centers for
 * Medicare & Medicaid Services (CMS)" for the same organization; left as-is,
 * the corpus would carry two spellings of one steward. `&amp;` is decoded
 * last so a source string containing "&amp;lt;" decodes to "&lt;", not "<".
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Upstream titles carry a trailing "FHIR" that is a naming artifact of the
 * QDM-to-FHIR translation, not part of the measure name.
 */
function cleanTitle(title: string | undefined): string | undefined {
  return title?.replace(/FHIR$/, '').trim()
}

/**
 * Identifiers, preferring the short name. The cmsId on this source is a bare
 * "122FHIR", which is not a usable identifier on its own; the short name
 * "CMS122FHIR" is the same value with the prefix, so it is what gets published.
 */
function identifiersFrom(identifier: Identifier[] | undefined): string[] {
  const shortName = identifier?.find((i) => i.system === SHORT_NAME_SYSTEM)?.value
  if (shortName) return [shortName]
  const cmsId = identifier?.find((i) => i.system === CMS_ID_SYSTEM)?.value
  return cmsId ? [`CMS${cmsId}`] : []
}

/** Parses a FHIR Measure resource. Returns undefined rather than throwing. */
export function readMeasure(json: string): UpstreamMeasure | undefined {
  let resource: MeasureResource
  try {
    resource = JSON.parse(json) as MeasureResource
  } catch {
    return undefined
  }
  if (resource.resourceType !== 'Measure' || !resource.name) return undefined

  const year = resource.effectivePeriod?.start?.slice(0, 4)

  return {
    name: resource.name,
    version: resource.version,
    title: cleanTitle(resource.title),
    description: resource.description,
    steward: resource.publisher && decodeEntities(resource.publisher),
    identifiers: identifiersFrom(resource.identifier),
    measurementPeriod: year && /^\d{4}$/.test(year) ? Number(year) : undefined,
    library: resource.library?.[0]?.split('/').pop(),
    status: resource.status,
  }
}


export interface MeasureStripResult {
  /** The resource to write. Byte-identical to the input when nothing was removed. */
  json: string
  /** One entry per removed display, as "<system name> <code>", sorted and deduplicated. */
  removed: string[]
}

/**
 * Removes display text for code systems whose licence does not permit
 * redistributing it, keeping the code and the code system. The same rule
 * `stripRestrictedDisplays` applies to CQL, applied to a FHIR resource.
 *
 * A `Measure` carries its effective data requirements as a contained `Library`,
 * and each directly referenced code appears there as a `cqf-directReferenceCode`
 * extension with the descriptor in `valueCoding.display`. Against the pinned
 * upstream release that is 6 measures, 20 codings, 12 distinct CPT codes: the
 * same twelve the CQL rule already strips.
 *
 * When nothing is removed the input is returned unchanged rather than
 * reserialised. That is what keeps `relationship: unmodified` a true statement
 * about bytes: a package that claims to carry the upstream resource untouched
 * carries it untouched, whitespace and key order included.
 */
export function stripMeasureDisplays(raw: string): MeasureStripResult {
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    // Not parseable, so not modifiable. The caller has already rejected a
    // measure this shape via readMeasure; returning the input unchanged keeps
    // this function total rather than throwing on a path that cannot happen.
    return { json: raw, removed: [] }
  }

  const removed = new Set<string>()
  const stack: unknown[] = [doc]
  const seen = new Set<object>()
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      stack.push(...node)
    } else if (node && typeof node === 'object') {
      if (seen.has(node)) continue
      seen.add(node)
      const obj = node as Record<string, unknown>
      if (typeof obj.system === 'string' && typeof obj.display === 'string') {
        const policy = policyFor(obj.system)
        if (policy && !policy.displayAllowed) {
          removed.add(`${policy.name} ${typeof obj.code === 'string' ? obj.code : '?'}`)
          delete obj.display
        }
      }
      stack.push(...Object.values(obj))
    }
  }

  if (removed.size === 0) return { json: raw, removed: [] }
  return { json: `${JSON.stringify(doc, null, 2)}\n`, removed: [...removed].sort() }
}
