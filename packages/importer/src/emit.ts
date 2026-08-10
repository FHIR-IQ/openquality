import { stringify } from 'yaml'
import type { CqlValueSet } from './cql.js'

export interface PlanProvenance {
  upstream: string
  ref: string
  retrieved: string
  relationship: 'unmodified' | 'derived'
  modifications?: string[]
}

export interface PackagePlan {
  id: string
  version: string
  slug: string
  title: string
  description?: string
  steward?: string
  identifiers: string[]
  measurementPeriod?: number
  dataModel: string
  cqlFileName: string
  /**
   * Included libraries vendored into this package's cql/ directory, resolved
   * transitively. They are artifacts of this package, not dependencies on other
   * packages: see the note in emitManifest.
   */
  libraryFileNames: string[]
  valueSets: CqlValueSet[]
  provenance: PlanProvenance
}

/** Every seeded package is CC0, matching the upstream licence. */
const LICENSE = 'CC0-1.0'

export function emitManifest(plan: PackagePlan): string {
  const manifest: Record<string, unknown> = {
    id: plan.id,
    version: plan.version,
    license: LICENSE,
  }
  if (plan.measurementPeriod) manifest.measurementPeriod = plan.measurementPeriod

  const measure: Record<string, unknown> = { title: plan.title }
  if (plan.steward) measure.steward = plan.steward
  if (plan.identifiers.length > 0) measure.identifiers = plan.identifiers
  manifest.measure = measure

  manifest.dataModel = plan.dataModel

  // The measure library first, then every library it includes. All are real
  // files in this package, so all are declared: `artifacts.present` then checks
  // each one exists, which is the guarantee that a vendored package is complete.
  //
  // Deliberately NOT emitted as `dependencies`. A shared CQL library is not a
  // measure, and the manifest requires `measure.title` for Level 1, so
  // publishing FHIRHelpers as its own package would mean inventing measure
  // identity for something that is not a measure.
  manifest.artifacts = [
    { path: `cql/${plan.cqlFileName}`, type: 'cql' },
    ...plan.libraryFileNames.map((name) => ({ path: `cql/${name}`, type: 'cql' })),
  ]

  // Only value sets that resolved to an OID or a URL are emitted. The core
  // check rejects an entry with neither, and a value set the parser could not
  // resolve is a skip condition rather than something to emit half of.
  //
  // Deduplicated because CQL legitimately declares one value set under two
  // names, and the manifest lists value sets rather than the names logic gives
  // them. CMS1028 declares 2.16.840.1.113762.1.4.1029.302 as both
  // "Placenta Accreta" and "Placental Accreta Spectrum", which put the same OID
  // in that manifest twice.
  //
  // The key is the oid and url together, not the oid alone. Two entries sharing
  // an OID but disagreeing on its URL are contradictory rather than redundant,
  // and collapsing them here would hide a real problem from the validator that
  // exists to report it.
  const seen = new Set<string>()
  const valueSets = plan.valueSets
    .filter((v) => v.oid || v.url)
    .filter((v) => {
      const key = `${v.oid ?? ''}|${v.url ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((v) => {
      const entry: Record<string, unknown> = {}
      if (v.oid) entry.oid = v.oid
      if (v.url) entry.url = v.url
      entry.source = 'vsac'
      return entry
    })
  if (valueSets.length > 0) manifest.valueSets = valueSets

  const provenance: Record<string, unknown> = {
    upstream: plan.provenance.upstream,
    ref: plan.provenance.ref,
    retrieved: plan.provenance.retrieved,
    relationship: plan.provenance.relationship,
  }
  if (plan.provenance.modifications?.length) {
    provenance.modifications = plan.provenance.modifications
  }
  manifest.provenance = provenance

  return stringify(manifest, { lineWidth: 0 })
}

export function emitReadme(plan: PackagePlan): string {
  const lines: string[] = [`# ${plan.title}`, '']

  lines.push('## Intent', '')
  lines.push(plan.description ?? plan.title, '')

  lines.push('## Known Limitations', '')
  lines.push(
    'None recorded yet. This section is deliberately empty rather than filled in',
    'automatically: known limitations are exactly the knowledge that is not written',
    'down anywhere, and inventing them would be worse than leaving the gap visible.',
    '',
    'If you have implemented this measure and hit something a future implementer',
    'should know, that is the most useful contribution you can make here. File it',
    'in [`knowledge/`](../../../knowledge/). It needs a GitHub account and nothing else.',
    '',
  )

  lines.push('## Provenance', '')
  lines.push(
    `Redistributed from [${plan.provenance.upstream}](${plan.provenance.upstream}) at commit`,
    `\`${plan.provenance.ref}\`, retrieved ${plan.provenance.retrieved}, under ${LICENSE}.`,
    '',
  )

  if (plan.provenance.relationship === 'derived' && plan.provenance.modifications?.length) {
    lines.push('Modified from the upstream content:', '')
    for (const modification of plan.provenance.modifications) lines.push(`- ${modification}`)
    lines.push('')
  } else {
    lines.push('Redistributed unmodified.', '')
  }

  if (plan.steward) {
    lines.push(
      `Measure steward: ${plan.steward}. The steward is not the publisher of this`,
      'package, and Open Quality is not a measure steward. See',
      '[`measures/cms-fhir-2026/README.md`](../README.md) for what the steward line means',
      'on this collection.',
      '',
    )
  }

  lines.push(
    'Upstream describes this content as draft, translated from the QDM eCQMs as they',
    'existed in MADiE. The package version is the upstream version and reflects that.',
    '',
  )

  return lines.join('\n')
}
