import type { Manifest } from './manifest.js'
import type { CheckId, ConformanceLevel, ValidationReport } from './report.js'
import { hasError, ran } from './report.js'

const LEVEL_0_CHECKS: CheckId[] = ['manifest.schema', 'manifest.license', 'artifacts.present']

const LEVEL_1_CHECKS: CheckId[] = [
  ...LEVEL_0_CHECKS,
  'manifest.dataModel',
  'artifacts.typed',
  'valuesets.referenced',
  'readme.sections',
  'content.forbidden',
]

/** Maps an artifact type to the deep check Level 2 requires for it. */
function deepCheckFor(artifactType: string): CheckId | undefined {
  if (artifactType === 'cql') return 'cql.translate'
  if (artifactType === 'sql') return 'sql.parse'
  if (artifactType.startsWith('fhir/')) return 'fhir.validate'
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
  if (!manifest.dataModel) level1Blockers.push('manifest does not declare a dataModel')
  if (level1Blockers.length > 0) {
    return { level: 0, blockers: level1Blockers }
  }

  const level2Blockers = evaluate(requiredDeepChecks(manifest), report)
  if (level2Blockers.length > 0) {
    return { level: 1, blockers: level2Blockers }
  }

  return { level: 2, blockers: [] }
}
