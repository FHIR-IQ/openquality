/** Severity of a single validation finding. */
export type Severity = 'error' | 'warning' | 'info'

/**
 * Every check the validator can run. Deep checks (cql.*, fhir.*, sql.*) are
 * declared here but implemented by the validator worker in a later plan.
 */
export type CheckId =
  | 'manifest.schema'
  | 'manifest.license'
  | 'manifest.dataModel'
  | 'manifest.measure'
  | 'artifacts.present'
  | 'artifacts.typed'
  | 'valuesets.referenced'
  | 'readme.sections'
  | 'content.forbidden'
  | 'cql.translate'
  | 'fhir.validate'
  | 'sql.parse'

export interface Finding {
  check: CheckId
  severity: Severity
  message: string
  /** Package-relative path the finding applies to, when it applies to a file. */
  path?: string
}

export interface ValidationReport {
  /** Checks that actually executed. A check absent from this list did not run. */
  checksRun: CheckId[]
  findings: Finding[]
}

/** Conformance level. 0 Shared, 1 Described, 2 Verified. */
export type ConformanceLevel = 0 | 1 | 2

export function hasError(report: ValidationReport, check: CheckId): boolean {
  return report.findings.some((f) => f.check === check && f.severity === 'error')
}

export function ran(report: ValidationReport, check: CheckId): boolean {
  return report.checksRun.includes(check)
}
