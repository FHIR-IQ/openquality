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

  it('reports a CQL declaration even in a file that is not named .cql', () => {
    // This used to assert the opposite, back when the check gated on the `.cql`
    // extension. The gate was the bug: packPackage ships the whole directory,
    // so a licensed descriptor pasted into a README is redistributed exactly
    // like one in a library. Same shape as knowledge/corpus/2026-005, where
    // keying detection off the file type was the bypass.
    expect(checkTerminology('README.md', CPT_CQL)).toHaveLength(1)
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

describe('comments between the tokens of a declaration', () => {
  // Reported by an outside reviewer. A block comment between `display` and its
  // string is valid CQL, changes nothing about the bytes redistributed, and
  // stopped the descriptor check matching at all.
  const withGap = (gap: string) =>
    [
      `library Example version '1.0.000'`,
      ``,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      ``,
      `code "N": '97804' from "CPT" display ${gap}'Medical nutrition therapy'`,
    ].join('\n')

  it('still reports a descriptor split by a block comment', () => {
    const findings = checkTerminology('m.cql', withGap('/* harmless */ '))
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('97804')
  })

  it('still reports a descriptor split by a multi-line block comment', () => {
    const findings = checkTerminology('m.cql', withGap('/* one\n   two */\n  '))
    expect(findings).toHaveLength(1)
  })

  it('still reports a descriptor split by a line comment', () => {
    const findings = checkTerminology('m.cql', withGap('// note\n  '))
    expect(findings).toHaveLength(1)
  })

  it('still records the alias when the codesystem declaration carries a comment', () => {
    // The worse half of the same hole: an unmatched codesystem declaration
    // means the alias is never recorded, checkTerminology returns early, and
    // no code declaration in the file is examined at all.
    const cql = [
      `codesystem /* which one */ "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "N": '97804' from "CPT" display 'Medical nutrition therapy'`,
    ].join('\n')
    expect(checkTerminology('m.cql', cql)).toHaveLength(1)
  })

  it('leaves an unrestricted code system alone however it is spaced', () => {
    const cql = [
      `codesystem /* fine */ "SNOMED": 'http://snomed.info/sct'`,
      `code "D": '44054006' from "SNOMED" display /* fine */ 'Diabetes mellitus type 2'`,
    ].join('\n')
    expect(checkTerminology('m.cql', cql)).toEqual([])
  })
})

describe('files that made the checks pathological', () => {
  const withCommentLines = (n: number, line = '// ') =>
    `library X version '1.0.0'\n` +
    `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'\n` +
    `${line}\n`.repeat(n) +
    // Deliberately unterminated, so the pattern fails and the engine explores
    // every way of matching what came before it. That is what turned a run of
    // comment lines into exponential work.
    `code "N": '97804' from "CPT" display\n`

  it('handles a large block of empty comment lines in linear time', () => {
    const started = Date.now()
    checkTerminology('x.cql', withCommentLines(20000))
    // Before the fix, 20 lines took 240ms and each extra line doubled it, so
    // this input would not have finished. A generous bound still catches any
    // return of super-linear behaviour.
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('handles a large block of ordinary comment lines in linear time', () => {
    const started = Date.now()
    checkTerminology('x.cql', withCommentLines(20000, '// an explanatory line'))
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('does not treat a URL inside a string as the start of a comment', () => {
    // The blanking pass has to know about strings: every CQL file is full of
    // 'http://...', and stripping from // to end of line would erase the code
    // system URL and with it the reason to check the file at all.
    const cql = [
      `library X version '1.0.0'`,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "N": '97804' from "CPT" display 'licensed text'`,
    ].join('\n')
    expect(checkTerminology('x.cql', cql)).toHaveLength(1)
  })
})

/**
 * The same licensed descriptors reach a package a second way, through a FHIR
 * resource rather than CQL. A `Measure` carries its effective data requirements
 * as a contained `Library`, and that Library records every directly referenced
 * code as a `cqf-directReferenceCode` extension with the descriptor in
 * `valueCoding.display`. Measured against the pinned upstream release, that is
 * the same six measures and the same twelve CPT codes the CQL rule already
 * names, in a place the CQL regex cannot see and the CI grep does not look.
 */
describe('licensed display text inside a FHIR resource', () => {
  const coding = (system: string, code: string, display?: string) =>
    JSON.stringify({ resourceType: 'Measure', group: [{ code: { coding: [{ system, code, ...(display ? { display } : {}) }] } }] })

  it('reports a CPT descriptor in a plain coding', () => {
    const findings = checkTerminology(
      'Measure-X.json',
      coding('http://www.ama-assn.org/go/cpt', '97804', 'Medical nutrition therapy; group'),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ check: 'content.forbidden', severity: 'error' })
    expect(findings[0].message).toContain('97804')
  })

  it('reports a CPT descriptor nested in a contained Library extension', () => {
    // The shape upstream actually ships, which is why the walk cannot key off
    // `coding` arrays alone.
    const measure = JSON.stringify({
      resourceType: 'Measure',
      contained: [
        {
          resourceType: 'Library',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/cqf-directReferenceCode',
              valueCoding: {
                system: 'http://www.ama-assn.org/go/cpt',
                code: '97802',
                display: 'Medical nutrition therapy; initial assessment',
              },
            },
          ],
        },
      ],
    })
    expect(checkTerminology('Measure-X.json', measure)).toHaveLength(1)
  })

  it('allows a code and code system with no display', () => {
    expect(checkTerminology('m.json', coding('http://www.ama-assn.org/go/cpt', '97804'))).toEqual([])
  })

  it('allows display text for a code system whose licence permits it', () => {
    expect(checkTerminology('m.json', coding('http://snomed.info/sct', '44054006', 'Diabetes mellitus'))).toEqual([])
    expect(checkTerminology('m.json', coding('http://loinc.org', '97506-0', 'Glucose management indicator'))).toEqual([])
  })

  it('does not mistake the near-miss OID for CPT', () => {
    // urn:oid:2.16.840.1.113883.6.120 is a different code system entirely.
    expect(checkTerminology('m.json', coding('urn:oid:2.16.840.1.113883.6.120', '1', 'x'))).toEqual([])
  })

  it('finds it in a file renamed away from .json', () => {
    // Detection must not depend on the extension: renaming was the original
    // bypass, recorded as knowledge/corpus/2026-005.
    expect(
      checkTerminology('notes.txt', coding('http://www.ama-assn.org/go/cpt', '97804', 'licensed')),
    ).toHaveLength(1)
  })

  it('reports one finding per code, not one per occurrence', () => {
    const twice = JSON.stringify({
      a: { system: 'http://www.ama-assn.org/go/cpt', code: '97804', display: 'x' },
      b: { system: 'http://www.ama-assn.org/go/cpt', code: '97804', display: 'x' },
    })
    expect(checkTerminology('m.json', twice)).toHaveLength(1)
  })

  it('fails closed when a file naming CPT cannot be parsed', () => {
    const broken = '{ "system": "http://www.ama-assn.org/go/cpt", "display": ["unclosed'
    const findings = checkTerminology('m.json', broken)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('could not be parsed')
  })

  it('does not parse or report a CQL file through the resource path', () => {
    // CQL never spells the key `system`, so the cheap reject keeps the parse
    // off all 302 CQL files and the CQL rule stays the one that reports them.
    const cql = [
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "N": '97804' from "CPT" display 'licensed'`,
    ].join('\n')
    expect(checkTerminology('x.cql', cql)).toHaveLength(1)
  })
})
