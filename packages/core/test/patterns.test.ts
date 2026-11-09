import { describe, expect, it } from 'vitest'
import { checkCqlPatterns } from '../src/patterns.js'

const HEAD = "library A version '1.0.0'\nusing QICore version '6.0.0'\n"

describe('checkCqlPatterns', () => {
  it('finds nothing in CQL that follows the patterns', () => {
    const cql = HEAD + 'define "E": [QICore.Encounter: "Office Visit"]\n'
    expect(checkCqlPatterns('cql/A.cql', cql)).toEqual([])
  })

  it('warns on a model declaration without a version', () => {
    const findings = checkCqlPatterns('cql/A.cql', "library A version '1.0.0'\nusing FHIR\n")
    expect(findings).toEqual([
      expect.objectContaining({ check: 'cql.patterns', severity: 'warning', path: 'cql/A.cql' }),
    ])
    expect(findings[0]!.message).toMatch(/line 2.*using FHIR.*version/)
  })

  it('warns on string-based membership testing', () => {
    const findings = checkCqlPatterns('cql/A.cql', HEAD + "define \"F\": 'female' in \"Administrative Gender\"\n")
    expect(findings.map((f) => f.severity)).toEqual(['warning'])
    expect(findings[0]!.message).toMatch(/line 3.*string-based membership/)
  })

  it('warns on contains applied to a terminology-valued element', () => {
    const findings = checkCqlPatterns('cql/A.cql', HEAD + 'define "C": exists ([QICore.Condition] C where C.category contains "Problem")\n')
    expect(findings.map((f) => f.severity)).toEqual(['warning'])
    expect(findings[0]!.message).toMatch(/line 3.*contains/)
  })

  it('reports unqualified retrieves once per file, as info, when the library uses more than one model', () => {
    const cql = HEAD + "using USCore version '6.1.0'\ndefine \"E\": [Encounter: \"Office Visit\"]\ndefine \"O\": [Observation]\n"
    const findings = checkCqlPatterns('cql/A.cql', cql)
    expect(findings).toEqual([expect.objectContaining({ severity: 'info' })])
    expect(findings[0]!.message).toMatch(/2 retrieves.*2 models/)
  })

  it('does not report unqualified retrieves in a single-model library, as the IG limits the practice', () => {
    expect(checkCqlPatterns('cql/A.cql', HEAD + 'define "E": [Encounter]\n')).toEqual([])
  })

  it('does not count brackets inside strings or quoted identifiers as retrieves', () => {
    const cql = HEAD + "using USCore version '6.1.0'\ncode \"BP [HOOS]\": '1' from \"LOINC\"\ndefine \"U\": 'mm[Hg]'\n"
    expect(checkCqlPatterns('cql/A.cql', cql)).toEqual([])
  })

  it('ignores anything inside a comment', () => {
    const cql = HEAD + "using USCore version '6.1.0'\n// 'female' in \"Administrative Gender\"\n/* [Encounter] */\n"
    expect(checkCqlPatterns('cql/A.cql', cql)).toEqual([])
  })
})
