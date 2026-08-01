import { describe, expect, it } from 'vitest'
import { checkTerminology, displayAllowed } from '../src/terminology.js'

const CPT_CQL = [
  `library Example version '1.0.000'`,
  ``,
  `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
  `codesystem "LOINC": 'http://loinc.org'`,
  ``,
  `code "Medical nutrition therapy; group": '97804' from "CPT" display 'Medical nutrition therapy; group'`,
  `code "Glucose management indicator": '97506-0' from "LOINC" display 'Glucose management indicator'`,
  ``,
].join('\n')

describe('displayAllowed', () => {
  it('forbids display text for CPT', () => {
    expect(displayAllowed('http://www.ama-assn.org/go/cpt')).toBe(false)
  })

  it('forbids display text for the CPT OID form', () => {
    expect(displayAllowed('urn:oid:2.16.840.1.113883.6.12')).toBe(false)
  })

  it('does not confuse the CPT OID with its neighbours', () => {
    expect(displayAllowed('urn:oid:2.16.840.1.113883.6.120')).toBe(true)
  })

  it('allows display text for LOINC and SNOMED CT', () => {
    expect(displayAllowed('http://loinc.org')).toBe(true)
    expect(displayAllowed('http://snomed.info/sct')).toBe(true)
  })

  it('allows display text for an unlisted system', () => {
    expect(displayAllowed('http://example.org/local')).toBe(true)
  })
})

describe('checkTerminology', () => {
  it('reports an error for CPT display text and leaves LOINC alone', () => {
    const findings = checkTerminology('cql/Example.cql', CPT_CQL)
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('content.forbidden')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('97804')
    expect(findings[0].path).toBe('cql/Example.cql')
  })

  it('accepts a CPT code that carries no display text', () => {
    const cql = CPT_CQL.replace(` display 'Medical nutrition therapy; group'`, '')
    expect(checkTerminology('cql/Example.cql', cql)).toEqual([])
  })

  it('ignores files that are not CQL', () => {
    expect(checkTerminology('README.md', CPT_CQL)).toEqual([])
  })

  it('ignores a CQL file with no restricted code system', () => {
    const cql = [
      `library Example version '1.0.000'`,
      `codesystem "LOINC": 'http://loinc.org'`,
      `code "A": '1-1' from "LOINC" display 'A'`,
    ].join('\n')
    expect(checkTerminology('cql/Example.cql', cql)).toEqual([])
  })

  it('produces identical results across repeated calls, guarding against stateful module-level regex lastIndex', () => {
    const first = checkTerminology('cql/Example.cql', CPT_CQL)
    const second = checkTerminology('cql/Example.cql', CPT_CQL)
    expect(second).toEqual(first)
    expect(second).toHaveLength(1)
  })

  it('matches an alias containing an escaped double quote identically in the declaration and the reference', () => {
    // The alias itself is `CPT\"2` (a literal backslash-quote inside the CQL
    // identifier). Without matching escape handling in both regexes, the
    // codesystem declaration and the code's `from` clause would capture this
    // alias as two different strings and the lookup between them would fail,
    // leaving the code silently unchecked instead of flagged.
    const cql = [
      `library Example version '1.0.000'`,
      `codesystem "CPT\\"2": 'http://www.ama-assn.org/go/cpt'`,
      `code "Test code": '99999' from "CPT\\"2" display 'Should be flagged'`,
    ].join('\n')
    const findings = checkTerminology('cql/Example.cql', cql)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('99999')
  })

  it('catches case-varied keywords, since this is a licensing filter rather than a CQL parser', () => {
    // Wrong-case keywords make this invalid CQL - a translator would reject
    // it - but nothing stops an invalid-but-close file from sitting in a
    // package at Level 1, which does not require translation.
    const cql = [
      `library Example version '1.0.000'`,
      `CodeSystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `Code "Medical nutrition therapy; group": '97804' From "CPT" Display 'Medical nutrition therapy; group'`,
    ].join('\n')
    const findings = checkTerminology('cql/Example.cql', cql)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('97804')
  })

  it('still flags a code declaration sitting inside a block comment', () => {
    // This is a regex over text, not a CQL parse, so it does not know the
    // declaration is commented out. That is intentional: the licensed
    // descriptor bytes are present in the redistributed file regardless of
    // whether the declaration is live code.
    const cql = [
      `library Example version '1.0.000'`,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `/*`,
      `code "Medical nutrition therapy; group": '97804' from "CPT" display 'Medical nutrition therapy; group'`,
      `*/`,
    ].join('\n')
    const findings = checkTerminology('cql/Example.cql', cql)
    expect(findings).toHaveLength(1)
  })

  it('handles a code declaration split across multiple lines', () => {
    const cql = [
      `library Example version '1.0.000'`,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "Medical nutrition therapy; group":`,
      `  '97804' from "CPT"`,
      `  display 'Medical nutrition therapy; group'`,
    ].join('\n')
    const findings = checkTerminology('cql/Example.cql', cql)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('97804')
  })

  it('does not mistake the word "display" inside a code name for a display clause', () => {
    const cql = [
      `library Example version '1.0.000'`,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "Office display unit": '97804' from "CPT"`,
    ].join('\n')
    expect(checkTerminology('cql/Example.cql', cql)).toEqual([])
  })
})
