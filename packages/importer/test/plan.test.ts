import { describe, expect, it } from 'vitest'
import { planPackage, resolveLibraries } from '../src/plan.js'
import type { UpstreamMeasure } from '../src/measure.js'

const MEASURE: UpstreamMeasure = {
  name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  version: '0.5.000',
  title: 'Diabetes: Glycemic Status Assessment Greater Than 9%',
  description: 'Percentage of patients 18-75 years of age with diabetes.',
  steward: 'National Committee for Quality Assurance',
  identifiers: ['CMS122FHIR'],
  measurementPeriod: 2026,
  library: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  status: 'active',
}

const CQL = [
  `library CMS122FHIRDiabetesAssessGreaterThan9Percent version '0.5.000'`,
  `using QICore version '6.0.0'`,
  `include FHIRHelpers version '4.4.000' called FHIRHelpers`,
  `valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'`,
].join('\n')

const CONTEXT = { ref: 'abc123', retrieved: '2026-08-01', upstream: 'https://example.org/upstream' }

describe('planPackage', () => {
  it('plans a complete measure', () => {
    const result = planPackage(MEASURE, CQL, CONTEXT)
    expect(result.skipped).toBeUndefined()
    expect(result.plan?.id).toBe('cms/diabetes-glycemic-status-assessment-greater-than-9')
    expect(result.plan?.version).toBe('0.5.0')
    expect(result.plan?.dataModel).toBe('qi-core')
  })

  it('leaves libraryFileNames empty; the caller vendors them', () => {
    const result = planPackage(MEASURE, CQL, CONTEXT)
    expect(result.plan?.libraryFileNames).toEqual([])
  })

  it('marks the package derived and lists what was stripped', () => {
    const withCpt = [
      CQL,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "MNT": '97804' from "CPT" display 'Medical nutrition therapy'`,
    ].join('\n')
    const result = planPackage(MEASURE, withCpt, CONTEXT)
    expect(result.plan?.provenance.relationship).toBe('derived')
    expect(result.plan?.provenance.modifications?.[0]).toContain('CPT 97804')
    expect(result.cql).not.toContain('display')
  })

  it('marks the package unmodified when nothing was stripped', () => {
    expect(planPackage(MEASURE, CQL, CONTEXT).plan?.provenance.relationship).toBe('unmodified')
  })

  it('skips a measure with no parseable version', () => {
    const result = planPackage({ ...MEASURE, version: 'draft' }, CQL, CONTEXT)
    expect(result.plan).toBeUndefined()
    expect(result.skipped?.reason).toContain('version')
  })

  it('skips a measure with no description', () => {
    const result = planPackage({ ...MEASURE, description: undefined }, CQL, CONTEXT)
    expect(result.skipped?.reason).toContain('description')
  })

  it('skips a measure with no title', () => {
    const result = planPackage({ ...MEASURE, title: undefined }, CQL, CONTEXT)
    expect(result.skipped?.reason).toContain('title')
  })

  it('skips when the CQL declares no library header', () => {
    const result = planPackage(MEASURE, 'define "X": true', CONTEXT)
    expect(result.skipped?.reason).toContain('library')
  })

  it('records the measure name on every skip so the report can name it', () => {
    const result = planPackage({ ...MEASURE, version: 'draft' }, CQL, CONTEXT)
    expect(result.skipped?.measure).toBe('CMS122FHIRDiabetesAssessGreaterThan9Percent')
  })
})

describe('resolveLibraries', () => {
  const available = new Map([
    ['FHIRHelpers', `library FHIRHelpers version '4.4.000'`],
    ['QICoreCommon', [`library QICoreCommon version '4.0.000'`, `include FHIRHelpers version '4.4.000'`].join('\n')],
    ['Deep', `library Deep version '1.0.000'\ninclude QICoreCommon version '4.0.000'`],
  ])

  it('resolves a direct include', () => {
    const { resolved, missing } = resolveLibraries(`include FHIRHelpers version '4.4.000'`, available)
    expect(resolved).toEqual(['FHIRHelpers'])
    expect(missing).toEqual([])
  })

  it('resolves transitively', () => {
    const { resolved } = resolveLibraries(`include Deep version '1.0.000'`, available)
    expect(resolved).toEqual(['Deep', 'FHIRHelpers', 'QICoreCommon'])
  })

  it('returns a stable sorted order so importer output is deterministic', () => {
    const a = resolveLibraries(`include Deep version '1.0.000'`, available).resolved
    const b = resolveLibraries(`include Deep version '1.0.000'`, available).resolved
    expect(a).toEqual(b)
    expect(a).toEqual([...a].sort())
  })

  it('reports a missing library rather than guessing', () => {
    const { resolved, missing } = resolveLibraries(`include Absent version '1.0.000'`, available)
    expect(resolved).toEqual([])
    expect(missing).toEqual(['Absent'])
  })

  it('terminates on a circular include', () => {
    const cyclic = new Map([
      ['A', `library A version '1.0.000'\ninclude B version '1.0.000'`],
      ['B', `library B version '1.0.000'\ninclude A version '1.0.000'`],
    ])
    const { resolved } = resolveLibraries(`include A version '1.0.000'`, cyclic)
    expect(resolved).toEqual(['A', 'B'])
  })
})
