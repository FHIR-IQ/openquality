import { describe, expect, it } from 'vitest'
import { normalizeVersion, packageId, slugFor } from '../src/naming.js'

describe('normalizeVersion', () => {
  it('normalizes the upstream zero-padded form', () => {
    expect(normalizeVersion('0.5.000')).toBe('0.5.0')
    expect(normalizeVersion('1.27.000')).toBe('1.27.0')
    expect(normalizeVersion('4.4.000')).toBe('4.4.0')
  })

  it('leaves an already canonical version alone', () => {
    expect(normalizeVersion('1.2.3')).toBe('1.2.3')
  })

  it('pads a two-part version', () => {
    expect(normalizeVersion('2.1')).toBe('2.1.0')
  })

  it('returns undefined for something it cannot parse', () => {
    expect(normalizeVersion('draft')).toBeUndefined()
    expect(normalizeVersion(undefined)).toBeUndefined()
  })
})

describe('slugFor', () => {
  it('builds a slug from the measure title', () => {
    expect(slugFor('Diabetes: Glycemic Status Assessment Greater Than 9%')).toBe(
      'diabetes-glycemic-status-assessment-greater-than-9',
    )
  })

  it('collapses runs of punctuation and whitespace', () => {
    expect(slugFor('Breast   Cancer -- Screening')).toBe('breast-cancer-screening')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugFor('%Statin Therapy%')).toBe('statin-therapy')
  })
})

describe('packageId', () => {
  it('joins namespace and slug', () => {
    expect(packageId('cms', 'breast-cancer-screening')).toBe('cms/breast-cancer-screening')
  })

  it('matches the manifest id pattern', () => {
    expect(packageId('cms', 'fhir-helpers')).toMatch(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/)
  })
})
