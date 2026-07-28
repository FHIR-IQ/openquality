import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validatePackage, packPackage } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixtures/cms122')

describe('real CMS eCQM content', () => {
  it('validates to level 1 locally with no errors', async () => {
    const result = await validatePackage(fixture)
    expect(result.report.findings.filter((f) => f.severity === 'error')).toEqual([])
    expect(result.level).toBe(1)
  })

  it('parses the full measure identity block', async () => {
    const { manifest } = await validatePackage(fixture)
    expect(manifest?.measure?.identifiers).toContain('CMS122v13')
    expect(manifest?.measure?.steward).toBe('CMS')
    expect(manifest?.valueSets).toHaveLength(2)
  })

  it('names cql.translate as the only blocker to level 2', async () => {
    const { blockers } = await validatePackage(fixture)
    expect(blockers).toEqual(['cql.translate did not run'])
  })

  it('does not flag CQL value set references as embedded content', async () => {
    const { report } = await validatePackage(fixture)
    expect(report.findings.filter((f) => f.check === 'content.forbidden')).toEqual([])
  })

  it('packs deterministically', async () => {
    const a = await packPackage(fixture)
    const b = await packPackage(fixture)
    expect(a.digest).toBe(b.digest)
  })
})
