import type { Manifest } from './manifest.js'
import type { CheckId, ConformanceLevel, ValidationReport } from './report.js'
import { hasError, ran } from './report.js'

const LEVEL_0_CHECKS: CheckId[] = ['manifest.schema', 'manifest.license', 'artifacts.present']

const LEVEL_1_CHECKS: CheckId[] = [
  ...LEVEL_0_CHECKS,
  'manifest.dataModel',
  'manifest.measure',
  'artifacts.typed',
  'valuesets.referenced',
  'readme.sections',
  'content.forbidden',
]

/**
 * Supporting material rather than measure logic. Documentation neither needs
 * verifying nor counts as something that was verified.
 */
const SUPPORTING_TYPES = new Set(['doc'])

/** Maps an artifact type to the deep check Level 2 requires for it. */
function deepCheckFor(artifactType: string): CheckId | undefined {
  if (artifactType === 'cql') return 'cql.translate'
  if (artifactType === 'sql') return 'sql.parse'
  // A ViewDefinition is itself a FHIR resource, so the FHIR validator covers it.
  if (artifactType.startsWith('fhir/') || artifactType === 'sql-on-fhir/ViewDefinition') {
    return 'fhir.validate'
  }
  return undefined
}

/** Deep checks this specific package needs, derived from the artifacts it declares. */
export function requiredDeepChecks(manifest: Manifest): CheckId[] {
  const required = new Set<CheckId>()
  for (const artifact of manifest.artifacts) {
    const check = deepCheckFor(artifact.type)
    if (check) required.add(check)
  }
  return [...required]
}

/**
 * Artifact types carrying measure logic that no validator can check, currently
 * python, r and notebook. They must block Level 2: "Verified" has to mean
 * something was actually verified, and without this an author reaches the top
 * level by choosing a type nothing knows how to inspect.
 */
export function unverifiableArtifactTypes(manifest: Manifest): string[] {
  const types = manifest.artifacts
    .filter((a) => !deepCheckFor(a.type) && !SUPPORTING_TYPES.has(a.type))
    .map((a) => a.type)
  return [...new Set(types)]
}

export interface LevelResult {
  level: ConformanceLevel
  /** Human readable reasons the package did not reach the next level up. */
  blockers: string[]
}

function evaluate(checks: CheckId[], report: ValidationReport): string[] {
  const blockers: string[] = []
  for (const check of checks) {
    if (!ran(report, check)) blockers.push(`${check} did not run`)
    else if (hasError(report, check)) blockers.push(`${check} reported an error`)
  }
  return blockers
}

/**
 * Computes the conformance level. Levels measure rigour rather than FHIR
 * adoption, so a SQL only package can reach Level 2 by passing sql.parse.
 * Only errors matter; warnings never change the level.
 */
export function computeLevel(manifest: Manifest, report: ValidationReport): LevelResult {
  const level0Blockers = evaluate(LEVEL_0_CHECKS, report)
  if (level0Blockers.length > 0) {
    return { level: 0, blockers: level0Blockers }
  }

  const level1Blockers = evaluate(
    LEVEL_1_CHECKS.filter((c) => !LEVEL_0_CHECKS.includes(c)),
    report,
  )
  if (level1Blockers.length > 0) {
    return { level: 0, blockers: level1Blockers }
  }

  const deepChecks = requiredDeepChecks(manifest)
  const level2Blockers = evaluate(deepChecks, report)

  for (const type of unverifiableArtifactTypes(manifest)) {
    level2Blockers.push(`artifact type "${type}" has no defined Level 2 verification`)
  }

  // A package of nothing but documentation has no logic to verify, so Verified
  // would be an empty claim. Level 2 requires at least one artifact that some
  // validator actually inspected.
  if (deepChecks.length === 0) {
    level2Blockers.push('package has no artifact that any Level 2 validator can verify')
  }

  if (level2Blockers.length > 0) {
    return { level: 1, blockers: level2Blockers }
  }

  return { level: 2, blockers: [] }
}
