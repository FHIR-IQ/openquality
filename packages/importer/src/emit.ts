import { stringify } from 'yaml'
import type { CqlValueSet } from './cql.js'

export interface PlanProvenance {
  upstream: string
  ref: string
  retrieved: string
  relationship: 'unmodified' | 'derived'
  modifications?: string[]
}

export interface PackageRef {
  id: string
  version: string
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
   * The FHIR Measure resource written into the package, as `fhir/<name>.json`.
   * Without it a package carries the logic but not the measure: nothing states
   * the populations, the scoring, or the canonical identity, so no evaluator
   * can run it. It is also what the Shareable Measure Repository role in
   * CQFMeasures expects a repository to represent.
   */
  measureFileName: string
  /**
   * The shared library packages this measure's CQL includes directly. The
   * libraries are published once as their own packages rather than copied into
   * every measure, and resolved transitively by whatever reads the package.
   */
  dependencies: PackageRef[]
  valueSets: CqlValueSet[]
  provenance: PlanProvenance
}

/** Every seeded package is CC0, matching the upstream licence. */
const LICENSE = 'CC0-1.0'

function valueSetsFor(input: CqlValueSet[]): Record<string, unknown>[] {
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
  return input
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
}

function provenanceFor(p: PlanProvenance): Record<string, unknown> {
  const provenance: Record<string, unknown> = {
    upstream: p.upstream,
    ref: p.ref,
    retrieved: p.retrieved,
    relationship: p.relationship,
  }
  if (p.modifications?.length) provenance.modifications = p.modifications
  return provenance
}

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

  // The Measure and its own CQL. Shared libraries are dependencies, published
  // once each as library packages, not copied in: a copy in every measure meant
  // a fix had to be made up to 52 times, and nothing said whether all were made.
  manifest.artifacts = [
    { path: `fhir/${plan.measureFileName}`, type: 'fhir/Measure' },
    { path: `cql/${plan.cqlFileName}`, type: 'cql' },
  ]
  if (plan.dependencies.length > 0) manifest.dependencies = plan.dependencies

  const valueSets = valueSetsFor(plan.valueSets)
  if (valueSets.length > 0) manifest.valueSets = valueSets

  manifest.provenance = provenanceFor(plan.provenance)

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

/** One shared CQL library, published as its own package for measures to depend on. */
export interface LibraryPlan {
  id: string
  version: string
  slug: string
  /** The CQL library name, as `include` statements use it. */
  name: string
  /** The CQL header version exactly, which is what an include resolves against. */
  cqlVersion: string
  dataModel: string
  cqlFileName: string
  valueSets: CqlValueSet[]
  dependencies: PackageRef[]
  /** Ids of the measure packages that reach this library, directly or not. */
  includedBy: string[]
  provenance: PlanProvenance
}

export function emitLibraryManifest(plan: LibraryPlan): string {
  const manifest: Record<string, unknown> = {
    id: plan.id,
    version: plan.version,
    license: LICENSE,
    library: { name: plan.name, version: plan.cqlVersion },
    dataModel: plan.dataModel,
    artifacts: [{ path: `cql/${plan.cqlFileName}`, type: 'cql' }],
  }
  if (plan.dependencies.length > 0) manifest.dependencies = plan.dependencies
  const valueSets = valueSetsFor(plan.valueSets)
  if (valueSets.length > 0) manifest.valueSets = valueSets
  manifest.provenance = provenanceFor(plan.provenance)
  return stringify(manifest, { lineWidth: 0 })
}

export function emitLibraryReadme(plan: LibraryPlan): string {
  const lines: string[] = [`# ${plan.name}`, '']

  lines.push('## Intent', '')
  lines.push(
    `Shared CQL library ${plan.name} version '${plan.cqlVersion}', published once so that`,
    'measures depend on it instead of each carrying a copy. Included by these measure',
    'packages in this collection, directly or through another library:',
    '',
  )
  for (const id of [...plan.includedBy].sort()) lines.push(`- \`${id}\``)
  lines.push('')

  lines.push('## Known Limitations', '')
  lines.push(
    'None recorded yet. If you have found something a future implementer of a measure',
    'that uses this library should know, file it in [`knowledge/`](../../../knowledge/).',
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

  return lines.join('\n')
}
