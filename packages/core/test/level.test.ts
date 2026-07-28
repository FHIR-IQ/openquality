import { describe, it, expect } from 'vitest'
import { computeLevel } from '../src/level.js'
import type { ValidationReport, CheckId } from '../src/report.js'
import type { Manifest } from '../src/manifest.js'

const L1_CHECKS: CheckId[] = [
  'manifest.schema', 'manifest.license', 'manifest.dataModel',
  'artifacts.present', 'artifacts.typed', 'valuesets.referenced',
  'readme.sections', 'content.forbidden',
]

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    id: 'a/b',
    version: '1.0.0',
    license: 'MIT',
    dataModel: 'fhir-r4',
    measure: { title: 'T', steward: 'CMS' },
    artifacts: [{ path: 'm.cql', type: 'cql' }],
    ...over,
  } as Manifest
}

function report(checksRun: CheckId[], findings: ValidationReport['findings'] = []): ValidationReport {
  return { checksRun, findings }
}

describe('computeLevel', () => {
  it('returns 0 when only the level 0 checks pass', () => {
    const r = computeLevel(manifest(), report(['manifest.schema', 'manifest.license', 'artifacts.present']))
    expect(r.level).toBe(0)
  })

  it('returns 1 when every level 1 check ran and passed', () => {
    const r = computeLevel(manifest(), report(L1_CHECKS))
    expect(r.level).toBe(1)
  })

  it('returns 2 when the deep check for the only artifact type passed', () => {
    const r = computeLevel(manifest(), report([...L1_CHECKS, 'cql.translate']))
    expect(r.level).toBe(2)
  })

  it('does not reach level 2 when a required deep check never ran', () => {
    const r = computeLevel(manifest(), report(L1_CHECKS))
    expect(r.level).toBe(1)
    expect(r.blockers.some((b) => b.match(/cql\.translate/))).toBe(true)
  })

  it('does not reach level 2 when a deep check ran and failed', () => {
    const r = computeLevel(
      manifest(),
      report([...L1_CHECKS, 'cql.translate'], [
        { check: 'cql.translate', severity: 'error', message: 'syntax error' },
      ]),
    )
    expect(r.level).toBe(1)
  })

  it('lets a SQL only package reach level 2, so SQL shops are not second class', () => {
    const sqlPkg = manifest({ artifacts: [{ path: 'm.sql', type: 'sql', dialect: 'postgres' }] })
    const r = computeLevel(sqlPkg, report([...L1_CHECKS, 'sql.parse']))
    expect(r.level).toBe(2)
  })

  it('requires every applicable deep check when a package mixes artifact types', () => {
    const mixed = manifest({
      artifacts: [
        { path: 'm.cql', type: 'cql' },
        { path: 'm.sql', type: 'sql', dialect: 'postgres' },
        { path: 'M.json', type: 'fhir/Measure' },
      ],
    })
    expect(computeLevel(mixed, report([...L1_CHECKS, 'cql.translate', 'sql.parse'])).level).toBe(1)
    expect(computeLevel(mixed, report([...L1_CHECKS, 'cql.translate', 'sql.parse', 'fhir.validate'])).level).toBe(2)
  })

  it('drops to 0 when a level 1 check fails, even if deep checks passed', () => {
    const r = computeLevel(
      manifest(),
      report([...L1_CHECKS, 'cql.translate'], [
        { check: 'readme.sections', severity: 'error', message: 'missing intent' },
      ]),
    )
    expect(r.level).toBe(0)
  })

  it('ignores warnings when computing the level', () => {
    const r = computeLevel(
      manifest(),
      report([...L1_CHECKS, 'cql.translate'], [
        { check: 'content.forbidden', severity: 'warning', message: 'mentions CPT' },
      ]),
    )
    expect(r.level).toBe(2)
  })

  it('lists blockers explaining what stands between the package and the next level', () => {
    const r = computeLevel(manifest({ dataModel: undefined }), report(L1_CHECKS))
    expect(r.level).toBe(0)
    expect(r.blockers.length).toBeGreaterThan(0)
  })
})
