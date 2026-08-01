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
