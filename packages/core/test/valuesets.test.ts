import { describe, it, expect } from 'vitest'
import { checkValueSetRefs } from '../src/valuesets.js'

describe('checkValueSetRefs', () => {
  it('accepts a well formed OID', () => {
    expect(checkValueSetRefs([{ oid: '2.16.840.1.113883.3.464.1003.103.12.1001', source: 'vsac' }]))
      .toEqual([])
  })

  it('accepts a canonical URL', () => {
    expect(checkValueSetRefs([{ url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464' }]))
      .toEqual([])
  })

  it('rejects a malformed OID', () => {
    const findings = checkValueSetRefs([{ oid: '2.16.840..1003' }])
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('valuesets.referenced')
    expect(findings[0].severity).toBe('error')
  })

  it('rejects a url that is not http or https', () => {
    const findings = checkValueSetRefs([{ url: 'ftp://example.org/vs' }])
    expect(findings).toHaveLength(1)
  })

  it('returns no findings when the package declares no value sets', () => {
    expect(checkValueSetRefs(undefined)).toEqual([])
  })

  it('rejects an entry with neither an oid nor a url', () => {
    const findings = checkValueSetRefs([{ source: 'vsac' }])
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('valuesets.referenced')
    expect(findings[0].message).toMatch(/oid or a url/)
  })

  it('reports every bad entry, not just the first', () => {
    const findings = checkValueSetRefs([{ oid: 'not.an.oid.x' }, {}, { url: 'ftp://x' }])
    expect(findings).toHaveLength(3)
  })

  it('tells an author to strip a urn:oid: prefix copied from their CQL', () => {
    const findings = checkValueSetRefs([{ oid: 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001' }])
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('valuesets.referenced')
    expect(findings[0].message).toMatch(/urn:oid:/)
    // The message must name the corrected value, not just reject the input.
    expect(findings[0].message).toMatch(/use 2\.16\.840\.1\.113883\.3\.464\.1003\.103\.12\.1001/)
  })
})
