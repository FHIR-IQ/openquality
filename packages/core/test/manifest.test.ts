import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/manifest.js'

const VALID = `
id: gene/hba1c-poor-control
version: 1.2.0
license: Apache-2.0
measurementPeriod: 2026
measure:
  title: "Diabetes: Hemoglobin A1c Poor Control (>9%)"
  steward: CMS
  identifiers: [CMS122v13, NQF-0059]
  type: intermediate-outcome
  improvementNotation: decrease
  domain: [diabetes]
  setting: [ambulatory]
dataModel: fhir-r4
artifacts:
  - path: cql/HbA1cPoorControl.cql
    type: cql
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
`

describe('parseManifest', () => {
  it('parses a complete valid manifest', () => {
    const result = parseManifest(VALID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.id).toBe('gene/hba1c-poor-control')
    expect(result.manifest.measure?.steward).toBe('CMS')
    expect(result.manifest.artifacts[0].type).toBe('cql')
  })

  it('parses a minimal manifest with only required fields', () => {
    const result = parseManifest(`
id: gene/minimal
version: 0.1.0
license: MIT
artifacts:
  - path: sql/measure.sql
    type: sql
    dialect: postgres
`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.measure).toBeUndefined()
    expect(result.manifest.dataModel).toBeUndefined()
  })

  it('rejects an id without a namespace', () => {
    const result = parseManifest('id: nonamespace\nversion: 1.0.0\nlicense: MIT\nartifacts: []')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings[0].check).toBe('manifest.schema')
    expect(result.findings[0].message).toMatch(/namespace\/name/)
  })

  it('rejects a non-semver version', () => {
    const result = parseManifest('id: a/b\nversion: 2026\nlicense: MIT\nartifacts: []')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings.some((f) => f.message.match(/semver/))).toBe(true)
  })

  it('rejects an sql artifact with no dialect', () => {
    const result = parseManifest(`
id: a/b
version: 1.0.0
license: MIT
artifacts:
  - path: q.sql
    type: sql
`)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings.some((f) => f.message.match(/dialect/))).toBe(true)
  })

  it.each([
    ['../../etc/passwd', 'a parent directory'],
    ['/etc/passwd', 'an absolute path'],
    ['cql/../../../secrets.txt', 'a buried parent segment'],
  ])('rejects an artifact path escaping the package via %s', (path) => {
    const result = parseManifest(`
id: a/b
version: 1.0.0
license: MIT
artifacts:
  - path: "${path}"
    type: doc
`)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings.some((f) => f.message.match(/stay inside the package/))).toBe(true)
  })

  it('reports a finding rather than throwing on malformed yaml', () => {
    const result = parseManifest('id: [unclosed')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings[0].check).toBe('manifest.schema')
  })
})

describe('dataModel', () => {
  const base = [
    'id: cms/example',
    'version: 0.5.0',
    'license: CC0-1.0',
    'artifacts:',
    '  - path: cql/Example.cql',
    '    type: cql',
  ].join('\n')

  it('accepts qi-core, which the upstream eCQM content declares', () => {
    const result = parseManifest(`${base}\ndataModel: qi-core\n`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.dataModel).toBe('qi-core')
  })

  it('still rejects an unknown data model', () => {
    const result = parseManifest(`${base}\ndataModel: nonsense\n`)
    expect(result.ok).toBe(false)
  })
})
