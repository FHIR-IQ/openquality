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

  it('reports unqualified retrieves once per file, as info', () => {
    const cql = HEAD + 'define "E": [Encounter: "Office Visit"]\ndefine "O": [Observation]\n'
    const findings = checkCqlPatterns('cql/A.cql', cql)
    expect(findings).toEqual([expect.objectContaining({ severity: 'info' })])
    expect(findings[0]!.message).toMatch(/2 retrieves/)
  })

  it('ignores anything inside a comment', () => {
    const cql = HEAD + "// 'female' in \"Administrative Gender\"\n/* [Encounter] */\n"
    expect(checkCqlPatterns('cql/A.cql', cql)).toEqual([])
  })
})
