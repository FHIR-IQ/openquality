import { describe, expect, it } from 'vitest'
import { readMeasure } from '../src/measure.js'

const RESOURCE = {
  resourceType: 'Measure',
  id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  url: 'https://madie.cms.gov/Measure/CMS122FHIRDiabetesAssessGreaterThan9Percent',
  version: '0.5.000',
  name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  title: 'Diabetes: Glycemic Status Assessment Greater Than 9%FHIR',
  status: 'active',
  experimental: false,
  publisher: 'National Committee for Quality Assurance',
  description:
    'Percentage of patients 18-75 years of age with diabetes who had a glycemic status assessment > 9.',
  effectivePeriod: { start: '2026-01-01', end: '2026-12-31' },
  library: ['https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent'],
  identifier: [
    {
      type: { coding: [{ code: 'short-name' }] },
      system: 'https://madie.cms.gov/measure/shortName',
      value: 'CMS122FHIR',
    },
    {
      type: { coding: [{ code: 'publisher' }] },
      system: 'https://madie.cms.gov/measure/cmsId',
      value: '122FHIR',
    },
  ],
}

describe('readMeasure', () => {
  it('reads identity, title and description', () => {
    const m = readMeasure(JSON.stringify(RESOURCE))
    expect(m?.name).toBe('CMS122FHIRDiabetesAssessGreaterThan9Percent')
    expect(m?.version).toBe('0.5.000')
    expect(m?.description).toContain('Percentage of patients 18-75')
  })

  it('strips the FHIR suffix the upstream titles carry', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.title).toBe(
      'Diabetes: Glycemic Status Assessment Greater Than 9%',
    )
  })

  it('reads the steward from publisher, which is NCQA not CMS', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.steward).toBe(
      'National Committee for Quality Assurance',
    )
  })

  it('decodes HTML entities in the steward, since upstream emits both encoded and literal ampersands for the same publisher', () => {
    const encoded = {
      ...RESOURCE,
      publisher: 'Centers for Medicare &amp; Medicaid Services (CMS)',
    }
    expect(readMeasure(JSON.stringify(encoded))?.steward).toBe(
      'Centers for Medicare & Medicaid Services (CMS)',
    )
  })

  it('leaves a steward with no entities untouched', () => {
    const plain = { ...RESOURCE, publisher: 'American Heart Association' }
    expect(readMeasure(JSON.stringify(plain))?.steward).toBe('American Heart Association')
  })

  it('builds identifiers from the short name', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.identifiers).toEqual(['CMS122FHIR'])
  })

  it('falls back to the cmsId when there is no short name', () => {
    const noShortName = {
      ...RESOURCE,
      identifier: [RESOURCE.identifier[1]],
    }
    expect(readMeasure(JSON.stringify(noShortName))?.identifiers).toEqual(['CMS122FHIR'])
  })

  it('reads the measurement period year from effectivePeriod', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.measurementPeriod).toBe(2026)
  })

  it('reads the library name', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.library).toBe(
      'CMS122FHIRDiabetesAssessGreaterThan9Percent',
    )
  })

  it('returns undefined for a resource that is not a Measure', () => {
    expect(readMeasure(JSON.stringify({ resourceType: 'Library' }))).toBeUndefined()
  })

  it('returns undefined for text that is not JSON', () => {
    expect(readMeasure('not json')).toBeUndefined()
  })
})
