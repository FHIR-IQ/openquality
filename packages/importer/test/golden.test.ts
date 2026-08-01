import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emitManifest, emitReadme } from '../src/emit.js'
import { readMeasure } from '../src/measure.js'
import { planPackage } from '../src/plan.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')

const CONTEXT = {
  upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
  ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
  retrieved: '2026-08-01',
}

async function planFixture() {
  const measure = readMeasure(await readFile(join(FIXTURES, 'upstream/measure/Example.json'), 'utf8'))
  const cql = await readFile(join(FIXTURES, 'upstream/cql/Example.cql'), 'utf8')
  const result = planPackage(measure!, cql, CONTEXT)
  expect(result.skipped).toBeUndefined()
  return result
}

describe('golden import', () => {
  it('produces the expected manifest', async () => {
    const { plan } = await planFixture()
    const expected = await readFile(join(FIXTURES, 'expected/openquality.yaml'), 'utf8')
    expect(emitManifest(plan!)).toBe(expected)
  })

  it('produces the expected README', async () => {
    const { plan } = await planFixture()
    const expected = await readFile(join(FIXTURES, 'expected/README.md'), 'utf8')
    expect(emitReadme(plan!)).toBe(expected)
  })

  it('marks the fixture derived because it carries CPT display text', async () => {
    const { plan } = await planFixture()
    expect(plan!.provenance.relationship).toBe('derived')
  })
})
