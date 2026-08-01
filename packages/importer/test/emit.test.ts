import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { checkReadmeSections, parseManifest } from '@openquality/core'
import { emitManifest, emitReadme, type PackagePlan } from '../src/emit.js'

const PLAN: PackagePlan = {
  id: 'cms/diabetes-glycemic-status-assessment-greater-than-9',
  version: '0.5.0',
  slug: 'diabetes-glycemic-status-assessment-greater-than-9',
  title: 'Diabetes: Glycemic Status Assessment Greater Than 9%',
  description: 'Percentage of patients 18-75 years of age with diabetes.',
  steward: 'National Committee for Quality Assurance',
  identifiers: ['CMS122FHIR'],
  measurementPeriod: 2026,
  dataModel: 'qi-core',
  cqlFileName: 'CMS122FHIRDiabetesAssessGreaterThan9Percent.cql',
  valueSets: [
    {
      name: 'Diabetes',
      url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
      oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
    },
  ],
  libraryFileNames: ['FHIRHelpers.cql', 'QICoreCommon.cql'],
  provenance: {
    upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
    ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
    retrieved: '2026-08-01',
    relationship: 'unmodified',
  },
}

describe('emitManifest', () => {
  it('produces a manifest the core parser accepts', () => {
    const result = parseManifest(emitManifest(PLAN))
    expect(result.ok).toBe(true)
  })

  it('carries identity, licence and data model', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.id).toBe('cms/diabetes-glycemic-status-assessment-greater-than-9')
    expect(manifest.version).toBe('0.5.0')
    expect(manifest.license).toBe('CC0-1.0')
    expect(manifest.dataModel).toBe('qi-core')
    expect(manifest.measurementPeriod).toBe(2026)
  })

  it('records the steward as given, not as CMS', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.measure.steward).toBe('National Committee for Quality Assurance')
  })

  it('declares the measure CQL and every vendored library as artifacts', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.artifacts).toEqual([
      { path: 'cql/CMS122FHIRDiabetesAssessGreaterThan9Percent.cql', type: 'cql' },
      { path: 'cql/FHIRHelpers.cql', type: 'cql' },
      { path: 'cql/QICoreCommon.cql', type: 'cql' },
    ])
  })

  it('emits no dependencies, because libraries are vendored not referenced', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.dependencies).toBeUndefined()
  })

  it('references value sets by oid and url, never embedding them', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.valueSets).toEqual([
      {
        oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
        url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
        source: 'vsac',
      },
    ])
  })

  it('emits the provenance block', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.provenance.relationship).toBe('unmodified')
    expect(manifest.provenance.ref).toBe('d4e0edd01b7da2a3b43d5360156b43761438190a')
  })

  it('lists modifications when the content was derived', () => {
    const derived = {
      ...PLAN,
      provenance: {
        ...PLAN.provenance,
        relationship: 'derived' as const,
        modifications: ['removed CPT display text from 3 code declarations'],
      },
    }
    const manifest = parse(emitManifest(derived))
    expect(manifest.provenance.modifications).toHaveLength(1)
  })
})

describe('emitReadme', () => {
  it('satisfies every section Level 1 requires', () => {
    expect(checkReadmeSections(emitReadme(PLAN))).toEqual([])
  })

  it('uses the upstream description as the intent', () => {
    expect(emitReadme(PLAN)).toContain('Percentage of patients 18-75 years of age with diabetes.')
  })

  it('leaves known limitations empty and asks for contributions', () => {
    const readme = emitReadme(PLAN)
    expect(readme).toContain('## Known Limitations')
    expect(readme).toContain('None recorded yet')
    expect(readme).toContain('knowledge/')
  })

  it('states the upstream commit in provenance', () => {
    expect(emitReadme(PLAN)).toContain('d4e0edd01b7da2a3b43d5360156b43761438190a')
  })

  it('says the steward is not CMS where that is the case', () => {
    expect(emitReadme(PLAN)).toContain('National Committee for Quality Assurance')
  })

  it('lists the modifications when the content was derived', () => {
    const derived = {
      ...PLAN,
      provenance: {
        ...PLAN.provenance,
        relationship: 'derived' as const,
        modifications: ['removed CPT display text from 3 code declarations'],
      },
    }
    expect(emitReadme(derived)).toContain('removed CPT display text from 3 code declarations')
  })
})
