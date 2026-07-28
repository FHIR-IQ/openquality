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
