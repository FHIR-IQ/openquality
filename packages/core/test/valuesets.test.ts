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

  it('warns when the same value set is declared twice, without blocking the level', () => {
    const oid = '2.16.840.1.113762.1.4.1029.302'
    const url = `http://cts.nlm.nih.gov/fhir/ValueSet/${oid}`
    const findings = checkValueSetRefs([
      { oid, url, source: 'vsac' },
      { oid, url, source: 'vsac' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('valuesets.referenced')
    // A warning rather than an error on purpose: the package resolves to the
    // same terminology either way, and only errors move the conformance level.
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain(oid)
    expect(findings[0].message).toMatch(/declared 2 times/)
  })

  it('counts a duplicate by url when the entries carry no oid', () => {
    const url = 'http://example.org/fhir/ValueSet/local-diabetes'
    const findings = checkValueSetRefs([{ url }, { url }])
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain(url)
  })

  it('reports one duplicate warning per value set, not one per extra copy', () => {
    const oid = '2.16.840.1.113762.1.4.1029.302'
    const findings = checkValueSetRefs([{ oid }, { oid }, { oid }])
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/declared 3 times/)
  })

  it('errors when one oid is declared with two different urls', () => {
    const oid = '2.16.840.1.113762.1.4.1029.302'
    const findings = checkValueSetRefs([
      { oid, url: `http://cts.nlm.nih.gov/fhir/ValueSet/${oid}` },
      { oid, url: 'http://example.org/fhir/ValueSet/something-else' },
    ])
    // Contradictory rather than redundant: the manifest asserts two identities
    // for one value set, so this blocks Level 1 where a plain duplicate does not.
    const errors = findings.filter((f) => f.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].check).toBe('valuesets.referenced')
    expect(errors[0].message).toContain(oid)
    expect(errors[0].message).toMatch(/different urls/)
  })

  it('does not call two distinct value sets a duplicate', () => {
    expect(
      checkValueSetRefs([
        { oid: '2.16.840.1.113762.1.4.1029.302' },
        { oid: '2.16.840.1.113762.1.4.1029.303' },
      ]),
    ).toEqual([])
  })

  it('does not group entries that have neither an oid nor a url', () => {
    const findings = checkValueSetRefs([{ source: 'vsac' }, { source: 'vsac' }])
    // Two "missing identity" errors, and no duplicate warning: they are not
    // known to be the same value set, only equally unidentified.
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.severity === 'error')).toBe(true)
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
