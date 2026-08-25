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
  const raw = await readFile(join(FIXTURES, 'upstream/measure/Example.json'), 'utf8')
  const measure = readMeasure(raw)
  const cql = await readFile(join(FIXTURES, 'upstream/cql/Example.cql'), 'utf8')
  const result = planPackage(measure!, cql, CONTEXT, raw)
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

  it('strips the CPT descriptor from the Measure and keeps the LOINC one', async () => {
    // The fixture carries the shape upstream ships: effective data requirements
    // as a contained Library with a descriptor per direct reference code. Both
    // the CQL and the resource carry a licensed descriptor, and both are
    // reported, because a reader checking the claim needs to know which file.
    const { measureJson, plan } = await planFixture()
    expect(measureJson).not.toContain('Medical nutrition therapy; group')
    expect(measureJson).toContain('"code": "97804"')
    expect(measureJson).toContain('Glucose management indicator')
    expect(plan!.provenance.modifications).toEqual([
      'removed licensed display text from 1 code declaration in the CQL: CPT 97804',
      'removed licensed display text from 1 coding in the Measure resource: CPT 97804',
    ])
  })
})
