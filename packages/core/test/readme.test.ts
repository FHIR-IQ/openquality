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
})

describe('Windows line endings', () => {
  // Reported by the first outside contributor, on Windows. A README with all
  // three sections was reported as having none: splitting on '\n' alone left a
  // trailing '\r', and `.` does not match '\r', so the ATX pattern could never
  // reach the end of the line.
  const SECTIONS = '# Measure\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n'

  it('finds ATX headings in a CRLF file', () => {
    expect(checkReadmeSections(SECTIONS.replace(/\n/g, '\r\n'))).toEqual([])
  })

  it('finds setext headings in a CRLF file', () => {
    const setext = 'Intent\n------\nx\n\nKnown Limitations\n-----\nx\n\nProvenance\n----\nx\n'
    expect(checkReadmeSections(setext.replace(/\n/g, '\r\n'))).toEqual([])
  })

  it('still reports a genuinely missing section in a CRLF file', () => {
    const missing = '# Measure\n\n## Intent\nx\n\n## Provenance\nx\n'
    const findings = checkReadmeSections(missing.replace(/\n/g, '\r\n'))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('known limitations')
  })
})
