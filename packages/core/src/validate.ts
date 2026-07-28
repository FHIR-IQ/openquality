import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseManifest, type Manifest } from './manifest.js'
import { checkLicense } from './licenses.js'
import { checkValueSetRefs } from './valuesets.js'
import { checkReadmeSections } from './readme.js'
import { scanContent } from './scanner.js'
import { computeLevel } from './level.js'
import type { CheckId, ConformanceLevel, Finding, ValidationReport } from './report.js'

export interface ValidationResult {
  manifest?: Manifest
  report: ValidationReport
  level: ConformanceLevel
  blockers: string[]
}

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Validates a package directory. Runs only checks that need no network, so
 * deep checks (cql.translate, fhir.validate, sql.parse) never appear in
 * checksRun here and a locally validated package tops out at Level 1.
 */
export async function validatePackage(dir: string): Promise<ValidationResult> {
  const findings: Finding[] = []
  const checksRun: CheckId[] = ['manifest.schema']

  const manifestSource = await readIfPresent(join(dir, 'openquality.yaml'))
  if (manifestSource === undefined) {
    findings.push({
      check: 'manifest.schema',
      severity: 'error',
      message: 'openquality.yaml not found at the package root',
      path: 'openquality.yaml',
    })
    return { report: { checksRun, findings }, level: 0, blockers: ['manifest.schema reported an error'] }
  }

  const parsed = parseManifest(manifestSource)
  if (!parsed.ok) {
    findings.push(...parsed.findings)
    return { report: { checksRun, findings }, level: 0, blockers: ['manifest.schema reported an error'] }
  }
  const manifest = parsed.manifest

  checksRun.push('manifest.license')
  findings.push(...checkLicense(manifest.license))

  checksRun.push('manifest.dataModel')

  checksRun.push('artifacts.present', 'artifacts.typed')
  if (manifest.artifacts.length === 0) {
    findings.push({
      check: 'artifacts.present',
      severity: 'error',
      message: 'package declares no artifacts',
      path: 'openquality.yaml',
    })
  }
  for (const artifact of manifest.artifacts) {
    if (!(await exists(join(dir, artifact.path)))) {
      findings.push({
        check: 'artifacts.present',
        severity: 'error',
        message: `declared artifact ${artifact.path} does not exist in the package`,
        path: artifact.path,
      })
    }
  }

  checksRun.push('valuesets.referenced')
  findings.push(...checkValueSetRefs(manifest.valueSets))

  checksRun.push('readme.sections')
  findings.push(...checkReadmeSections(await readIfPresent(join(dir, 'README.md'))))

  checksRun.push('content.forbidden')
  for (const artifact of manifest.artifacts) {
    const content = await readIfPresent(join(dir, artifact.path))
    if (content !== undefined) findings.push(...scanContent(artifact.path, content))
  }

  const report: ValidationReport = { checksRun, findings }
  const { level, blockers } = computeLevel(manifest, report)
  return { manifest, report, level, blockers }
}
