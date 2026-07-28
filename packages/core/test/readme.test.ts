import { describe, it, expect } from 'vitest'
import { checkReadmeSections, REQUIRED_SECTIONS } from '../src/readme.js'

const COMPLETE = `
# My Measure

## Intent
Measures poor glycemic control.

## Known Limitations
Assumes labs are coded with LOINC.

## Provenance
Derived from CMS122v13.
`

describe('checkReadmeSections', () => {
  it('accepts a readme with all required sections', () => {
    expect(checkReadmeSections(COMPLETE)).toEqual([])
  })

  it('matches headings case insensitively', () => {
    const lower = COMPLETE.replace('## Intent', '## intent')
    expect(checkReadmeSections(lower)).toEqual([])
  })

  it('reports each missing section separately', () => {
    const findings = checkReadmeSections('# Title\n\n## Intent\nsomething\n')
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.message).join(' ')).toMatch(/known limitations/i)
    expect(findings.map((f) => f.message).join(' ')).toMatch(/provenance/i)
  })

  it('reports every section missing when the readme is absent', () => {
    const findings = checkReadmeSections(undefined)
    expect(findings).toHaveLength(REQUIRED_SECTIONS.length)
  })

  it('ignores a section name that appears only in body text', () => {
    const findings = checkReadmeSections('# T\n\n## Intent\nSee provenance and known limitations below.\n')
    expect(findings).toHaveLength(2)
  })
})
