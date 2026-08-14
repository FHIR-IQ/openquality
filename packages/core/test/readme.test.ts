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

  it('does not let a heading that merely contains a required word satisfy it', () => {
    // "Unintentional" contains "intent". Accepting it would score a package
    // Level 1 without it ever documenting what the measure does.
    const findings = checkReadmeSections('# T\n\n## Unintentional Data Loss\ntext\n')
    expect(findings).toHaveLength(3)
    expect(findings.map((f) => f.message).join(' ')).toMatch(/intent/)
  })

  it('accepts a heading that qualifies a required word', () => {
    const findings = checkReadmeSections(
      '## Intent and Scope\nx\n\n## Known Limitations\nx\n\n## 3. Provenance\nx\n',
    )
    expect(findings).toEqual([])
  })

  it('recognises Setext headings, which are valid Markdown', () => {
    const findings = checkReadmeSections(
      'My Measure\n==========\n\nIntent\n------\nx\n\nKnown Limitations\n-----------------\nx\n\nProvenance\n----------\nx\n',
    )
    expect(findings).toEqual([])
  })

  it('accepts CRLF line endings (Windows checkouts)', () => {
    expect(checkReadmeSections(COMPLETE.replace(/\n/g, '\r\n'))).toEqual([])
  })

  it('recognises Setext headings with CRLF line endings', () => {
    const findings = checkReadmeSections(
      'My Measure\r\n==========\r\n\r\nIntent\r\n------\r\nx\r\n\r\nKnown Limitations\r\n-----------------\r\nx\r\n\r\nProvenance\r\n----------\r\nx\r\n',
    )
    expect(findings).toEqual([])
  })
})
