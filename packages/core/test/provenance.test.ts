import { describe, expect, it } from 'vitest'
import { checkProvenance, RELATIONSHIPS } from '../src/provenance.js'

const EXPECTED_RELATIONSHIPS = ['unmodified', 'derived']

describe('RELATIONSHIPS', () => {
  it('is exactly the accepted set, so widening it is a deliberate change', () => {
    expect([...RELATIONSHIPS]).toEqual(EXPECTED_RELATIONSHIPS)
  })
})

describe('checkProvenance', () => {
  const valid = {
    upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
    ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
    retrieved: '2026-08-01',
    relationship: 'unmodified',
  }

  it('reports nothing when the block is absent', () => {
    expect(checkProvenance(undefined)).toEqual([])
  })

  it('accepts a complete unmodified block', () => {
    expect(checkProvenance(valid)).toEqual([])
  })

  it('requires upstream, ref, retrieved and relationship', () => {
    const findings = checkProvenance({})
    expect(findings).toHaveLength(4)
    expect(findings.every((f) => f.check === 'manifest.provenance')).toBe(true)
    expect(findings.every((f) => f.severity === 'error')).toBe(true)
  })

  it('rejects an upstream that is not http or https', () => {
    const findings = checkProvenance({ ...valid, upstream: 'git@github.com:a/b.git' })
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('http')
  })

  it('rejects a retrieved date that is not ISO yyyy-mm-dd', () => {
    const findings = checkProvenance({ ...valid, retrieved: '1 August 2026' })
    expect(findings[0].message).toContain('YYYY-MM-DD')
  })

  it('rejects an unknown relationship', () => {
    const findings = checkProvenance({ ...valid, relationship: 'copied' })
    expect(findings[0].message).toContain('unmodified')
  })

  it('requires modifications when the relationship is derived', () => {
    const findings = checkProvenance({ ...valid, relationship: 'derived' })
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('modifications')
  })

  it('accepts derived when modifications are listed', () => {
    const findings = checkProvenance({
      ...valid,
      relationship: 'derived',
      modifications: ['stripped CPT display descriptors from 3 code declarations'],
    })
    expect(findings).toEqual([])
  })

  it('rejects an empty modifications list on derived', () => {
    const findings = checkProvenance({ ...valid, relationship: 'derived', modifications: [] })
    expect(findings).toHaveLength(1)
  })
})
