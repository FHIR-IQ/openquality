import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { checkReadmeSections, parseManifest } from '@openquality/core'
import { emitLibraryManifest, emitLibraryReadme, emitManifest, emitReadme, type LibraryPlan, type PackagePlan } from '../src/emit.js'

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
  measureFileName: 'Measure-Example.json',
  cqlFileName: 'CMS122FHIRDiabetesAssessGreaterThan9Percent.cql',
  valueSets: [
    {
      name: 'Diabetes',
      url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
      oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
    },
  ],
  dependencies: [
    { id: 'cms/lib-fhirhelpers', version: '4.4.0' },
    { id: 'cms/lib-qicorecommon', version: '4.0.0' },
  ],
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

  it('declares only the measure and its own CQL as artifacts, not shared libraries', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.artifacts).toEqual([
      { path: 'fhir/Measure-Example.json', type: 'fhir/Measure' },
      { path: 'cql/CMS122FHIRDiabetesAssessGreaterThan9Percent.cql', type: 'cql' },
    ])
  })

  it('names the shared libraries it includes as dependencies', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.dependencies).toEqual([
      { id: 'cms/lib-fhirhelpers', version: '4.4.0' },
      { id: 'cms/lib-qicorecommon', version: '4.0.0' },
    ])
  })

  it('omits dependencies when there are none', () => {
    expect(parse(emitManifest({ ...PLAN, dependencies: [] })).dependencies).toBeUndefined()
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

  it('declares a value set once when CQL gives it two names', () => {
    // CMS1028 declares 2.16.840.1.113762.1.4.1029.302 as both "Placenta Accreta"
    // and "Placental Accreta Spectrum". The manifest lists value sets, not the
    // names logic gives them, so it names this one once.
    const url = 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1029.302'
    const oid = '2.16.840.1.113762.1.4.1029.302'
    const twoNames = {
      ...PLAN,
      valueSets: [
        { name: 'Placenta Accreta', url, oid },
        { name: 'Placental Accreta Spectrum', url, oid },
      ],
    }
    const manifest = parse(emitManifest(twoNames))
    expect(manifest.valueSets).toEqual([{ oid, url, source: 'vsac' }])
  })

  it('keeps two entries that share an oid but disagree on its url', () => {
    // Contradictory rather than redundant. Collapsing them here would hide the
    // problem from the core check that exists to report it.
    const oid = '2.16.840.1.113762.1.4.1029.302'
    const conflicting = {
      ...PLAN,
      valueSets: [
        { name: 'A', url: `http://cts.nlm.nih.gov/fhir/ValueSet/${oid}`, oid },
        { name: 'B', url: 'http://example.org/fhir/ValueSet/other', oid },
      ],
    }
    const manifest = parse(emitManifest(conflicting))
    expect(manifest.valueSets).toHaveLength(2)
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

const LIBRARY: LibraryPlan = {
  id: 'cms/lib-qicorecommon',
  version: '4.0.0',
  slug: 'lib-qicorecommon',
  name: 'QICoreCommon',
  cqlVersion: '4.0.000',
  dataModel: 'qi-core',
  cqlFileName: 'QICoreCommon.cql',
  valueSets: [],
  dependencies: [{ id: 'cms/lib-fhirhelpers', version: '4.4.0' }],
  includedBy: ['cms/b-measure', 'cms/a-measure'],
  provenance: {
    upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
    ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
    retrieved: '2026-08-01',
    relationship: 'unmodified',
  },
}

describe('library packages', () => {
  it('produce a manifest the core parser accepts, with library identity and no measure', () => {
    const result = parseManifest(emitLibraryManifest(LIBRARY))
    expect(result.ok).toBe(true)
    const manifest = parse(emitLibraryManifest(LIBRARY))
    expect(manifest.library).toEqual({ name: 'QICoreCommon', version: '4.0.000' })
    expect(manifest.measure).toBeUndefined()
    expect(manifest.artifacts).toEqual([{ path: 'cql/QICoreCommon.cql', type: 'cql' }])
    expect(manifest.dependencies).toEqual([{ id: 'cms/lib-fhirhelpers', version: '4.4.0' }])
  })

  it('produce a README with every required section, listing the measures that include it, sorted', () => {
    const readme = emitLibraryReadme(LIBRARY)
    expect(checkReadmeSections(readme)).toEqual([])
    expect(readme.indexOf('cms/a-measure')).toBeLessThan(readme.indexOf('cms/b-measure'))
    expect(readme).toContain("QICoreCommon version '4.0.000'")
  })
})
