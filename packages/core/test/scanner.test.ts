import { describe, it, expect } from 'vitest'
import { scanContent } from '../src/scanner.js'

describe('scanContent', () => {
  it('passes a clean CQL file', () => {
    expect(scanContent('cql/M.cql', 'valueset "Diabetes": \'urn:oid:2.16.840.1\'')).toEqual([])
  })

  it('flags an embedded FHIR ValueSet expansion as an error', () => {
    const vs = JSON.stringify({
      resourceType: 'ValueSet',
      expansion: { contains: [{ system: 'http://loinc.org', code: '4548-4' }] },
    })
    const findings = scanContent('fhir/vs.json', vs)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/expansion/i)
  })

  it('allows a ValueSet with only a compose, which is a definition not an expansion', () => {
    const vs = JSON.stringify({
      resourceType: 'ValueSet',
      compose: { include: [{ system: 'http://loinc.org' }] },
    })
    expect(scanContent('fhir/vs.json', vs)).toEqual([])
  })

  it('warns on a CPT code system declaration', () => {
    const findings = scanContent('fhir/m.json', '{"system":"http://www.ama-assn.org/go/cpt"}')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toMatch(/CPT/)
  })

  it('warns on an NCQA copyright string', () => {
    const findings = scanContent('doc/spec.md', 'Copyright 2026 NCQA. HEDIS is a registered trademark.')
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('does not flag a plain mention of HEDIS, since discussing it is allowed', () => {
    expect(scanContent('README.md', 'This measure is similar in intent to a HEDIS measure.')).toEqual([])
  })

  it('does not crash on malformed JSON', () => {
    expect(() => scanContent('fhir/bad.json', '{not json')).not.toThrow()
  })

  it('flags an embedded expansion regardless of file extension', () => {
    // Detection must not be dodgeable by renaming the file, since this is the
    // one error-severity check and the licensing risk the registry cannot host.
    const vs = JSON.stringify({
      resourceType: 'ValueSet',
      expansion: { contains: [{ system: 'http://loinc.org', code: '4548-4' }] },
    })
    expect(scanContent('fhir/vs.yaml', vs)).toHaveLength(1)
    expect(scanContent('vs.txt', vs)).toHaveLength(1)
  })

  it('flags an embedded expansion written as block-style YAML', () => {
    const yaml = [
      'resourceType: ValueSet',
      'expansion:',
      '  contains:',
      '    - system: http://loinc.org',
      "      code: '4548-4'",
    ].join('\n')
    const findings = scanContent('fhir/vs.yaml', yaml)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
  })

  it('does not mistake a neighbouring OID for the CPT code system', () => {
    // 6.120 is a different code system; only 6.12 is CPT.
    expect(scanContent('fhir/m.json', '{"system":"urn:oid:2.16.840.1.113883.6.120"}')).toEqual([])
    expect(scanContent('fhir/m.json', '{"system":"urn:oid:2.16.840.1.113883.6.12"}')).toHaveLength(1)
  })
})

describe('an expansion the parser cannot read', () => {
  // Reported by an outside reviewer. A genuine expansion with one duplicated
  // key: YAML forbids duplicates so the parser throws, where a JSON parser
  // takes the last one and carries on. The scanner treated the thrown error as
  // "nothing here" and the package validated clean at Level 1.
  const DUPLICATE_KEY = `{
  "resourceType": "ValueSet",
  "resourceType": "ValueSet",
  "expansion": {
    "contains": [
      { "system": "http://snomed.info/sct", "code": "44054006", "display": "Diabetes mellitus type 2" }
    ]
  }
}`

  it('reports an expansion that does not parse, instead of passing it', () => {
    const findings = scanContent('vs.json', DUPLICATE_KEY)
    const errors = findings.filter((f) => f.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].check).toBe('content.forbidden')
    expect(errors[0].message).toMatch(/did not parse/)
  })

  it('still reports a well formed expansion through the structural check', () => {
    const clean = DUPLICATE_KEY.replace('  "resourceType": "ValueSet",\n', '')
    const errors = scanContent('vs.json', clean).filter((f) => f.severity === 'error')
    expect(errors).toHaveLength(1)
    // The structural check owns this one, so the message must not blame parsing.
    expect(errors[0].message).toMatch(/contains an embedded ValueSet expansion/)
  })

  it('does not fire on prose that discusses expansions', () => {
    // TERMINOLOGY.md explains this rule at length and must stay scannable.
    const prose = [
      '# Terminology',
      '',
      'Value sets are referenced by OID or canonical URL. An expansion is the',
      'list of codes a ValueSet resolves to, and redistributing one requires a',
      'UMLS licence, so no expansion is ever embedded in a package.',
    ].join('\n')
    expect(scanContent('TERMINOLOGY.md', prose)).toEqual([])
  })

  it('does not fire on a CQL file, which never parses as YAML', () => {
    const cql = `library M version '1.0.0'\n\nvalueset "D": 'urn:oid:2.16.840.1'\n\ndefine "X": true\n`
    expect(scanContent('cql/M.cql', cql)).toEqual([])
  })
})
