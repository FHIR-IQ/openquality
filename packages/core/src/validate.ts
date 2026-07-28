import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
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

function escapes(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || rel.startsWith('..') || isAbsolute(rel)
}

/**
 * Resolves a package-relative path, or undefined if it escapes the package.
 * The manifest schema already rejects ".." and absolute paths, but this is the
 * layer that actually opens files, so it does not delegate its own safety:
 * validatePackage runs over packages submitted by strangers.
 *
 * Checked twice, before and after following symlinks. `resolve` is purely
 * lexical, so a link sitting inside the package but pointing outside it passes
 * a lexical check untouched. That is the classic bypass.
 */
async function resolveInside(root: string, candidate: string): Promise<string | undefined> {
  const realRoot = await realpath(root).catch(() => resolve(root))
  const full = resolve(realRoot, candidate)
  if (escapes(realRoot, full)) return undefined

  const real = await realpath(full).catch(() => undefined)
  // Nonexistent path: nothing to follow, and the caller reports it as missing.
  if (real === undefined) return full
  return escapes(realRoot, real) ? undefined : real
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
    const full = await resolveInside(dir, artifact.path)
    if (full === undefined) {
      findings.push({
        check: 'artifacts.present',
        severity: 'error',
        message: `declared artifact ${artifact.path} resolves outside the package`,
        path: artifact.path,
      })
    } else if (!(await exists(full))) {
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
    const full = await resolveInside(dir, artifact.path)
    if (full === undefined) continue
    const content = await readIfPresent(full)
    if (content !== undefined) findings.push(...scanContent(artifact.path, content))
  }

  const report: ValidationReport = { checksRun, findings }
  const { level, blockers } = computeLevel(manifest, report)
  return { manifest, report, level, blockers }
}
