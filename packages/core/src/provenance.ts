import type { Finding } from './report.js'

export const RELATIONSHIPS = ['unmodified', 'derived'] as const

/**
 * Shape as it survives manifest schema parsing. Every field is optional there
 * on purpose, following the same reasoning as ValueSetSchema in manifest.ts:
 * a rule enforced in the Zod schema is reported as `manifest.schema` and aborts
 * the run, so the author sees one misattributed error instead of every problem
 * in their package.
 */
export interface ProvenanceRef {
  upstream?: string
  ref?: string
  retrieved?: string
  relationship?: string
  modifications?: string[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function error(message: string): Finding {
  return { check: 'manifest.provenance', severity: 'error', message, path: 'openquality.yaml' }
}

/**
 * Validates the provenance block when it is present. Absence is not an error:
 * a community author writing original logic has no upstream to declare, and
 * requiring the block would make them invent one. Seeded packages get it
 * because the importer always emits it and the CI drift check proves the
 * committed tree is the importer's output.
 */
export function checkProvenance(provenance: ProvenanceRef | undefined): Finding[] {
  if (!provenance) return []
  const findings: Finding[] = []

  if (!provenance.upstream) {
    findings.push(error('provenance.upstream is required: the URL the content came from'))
  } else if (!/^https?:\/\//.test(provenance.upstream)) {
    findings.push(error(`provenance.upstream "${provenance.upstream}" must be an http or https URL`))
  }

  // No format check beyond presence: a ref legitimately takes the shape of a
  // commit SHA, a tag, a branch, or a release name, and no single pattern
  // covers all of them. Presence is the only rule that holds across all four.
  if (!provenance.ref) {
    findings.push(
      error('provenance.ref is required: the upstream commit or release the content was taken from'),
    )
  }

  if (!provenance.retrieved) {
    findings.push(error('provenance.retrieved is required: the date the content was taken'))
  } else if (!ISO_DATE.test(provenance.retrieved)) {
    findings.push(error(`provenance.retrieved "${provenance.retrieved}" must be an ISO date, YYYY-MM-DD`))
  }

  if (!provenance.relationship) {
    findings.push(error(`provenance.relationship is required: ${RELATIONSHIPS.join(' or ')}`))
  } else if (!(RELATIONSHIPS as readonly string[]).includes(provenance.relationship)) {
    findings.push(
      error(
        `provenance.relationship "${provenance.relationship}" is not recognised. ` +
          `Use ${RELATIONSHIPS.join(' or ')}.`,
      ),
    )
  }

  // Checked separately from the enum above so that a package claiming a change
  // it never describes cannot pass. "derived" with no modifications list is the
  // claim that says nothing, and it is the one an importer bug would produce.
  if (provenance.relationship === 'derived' && (provenance.modifications?.length ?? 0) === 0) {
    findings.push(
      error('provenance.relationship "derived" requires a non-empty modifications list saying what changed'),
    )
  }

  return findings
}
