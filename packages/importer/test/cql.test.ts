import { describe, expect, it } from 'vitest'
import { parseHeader, parseIncludes, parseValueSets } from '../src/cql.js'

const CMS122 = [
  `library CMS122FHIRDiabetesAssessGreaterThan9Percent version '0.5.000'`,
  ``,
  `using QICore version '6.0.0'`,
  ``,
  `include FHIRHelpers version '4.4.000' called FHIRHelpers`,
  `include QICoreCommon version '4.0.000' called QICoreCommon`,
  `include AdvancedIllnessandFrailty version '1.27.000' called AIFrailLTCF`,
  ``,
  `codesystem "LOINC": 'http://loinc.org'`,
  ``,
  `valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'`,
  `valueset "HbA1c Laboratory Test": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013'`,
  ``,
].join('\n')

describe('parseHeader', () => {
  it('reads the library name, version and data model', () => {
    expect(parseHeader(CMS122)).toEqual({
      name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
      version: '0.5.000',
      model: 'QICore',
      modelVersion: '6.0.0',
    })
  })

  it('reads a plain FHIR data model', () => {
    const cql = [`library Example version '1.0.000'`, `using FHIR version '4.0.1'`].join('\n')
    expect(parseHeader(cql)?.model).toBe('FHIR')
  })

  it('returns undefined when there is no library declaration', () => {
    expect(parseHeader('define "X": true')).toBeUndefined()
  })
})

describe('parseIncludes', () => {
  it('reads every include with its version and alias', () => {
    expect(parseIncludes(CMS122)).toEqual([
      { library: 'FHIRHelpers', version: '4.4.000', alias: 'FHIRHelpers' },
      { library: 'QICoreCommon', version: '4.0.000', alias: 'QICoreCommon' },
      { library: 'AdvancedIllnessandFrailty', version: '1.27.000', alias: 'AIFrailLTCF' },
    ])
  })

  it('reads an include with no alias', () => {
    expect(parseIncludes(`include Hospice version '6.18.000'`)).toEqual([
      { library: 'Hospice', version: '6.18.000', alias: undefined },
    ])
  })

  it('returns an empty list when there are none', () => {
    expect(parseIncludes('define "X": true')).toEqual([])
  })
})

describe('parseValueSets', () => {
  it('reads canonical URLs and derives the OID', () => {
    expect(parseValueSets(CMS122)).toEqual([
      {
        name: 'Diabetes',
        url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
        oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
      },
      {
        name: 'HbA1c Laboratory Test',
        url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013',
        oid: '2.16.840.1.113883.3.464.1003.198.12.1013',
      },
    ])
  })

  it('derives the OID from a urn:oid reference', () => {
    const cql = `valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'`
    expect(parseValueSets(cql)[0]).toEqual({
      name: 'Diabetes',
      url: undefined,
      oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
    })
  })

  it('leaves the OID undefined when the URL does not end in one', () => {
    expect(parseValueSets(`valueset "Local": 'http://example.org/ValueSet/local-thing'`)[0]).toEqual({
      name: 'Local',
      url: 'http://example.org/ValueSet/local-thing',
      oid: undefined,
    })
  })
})
