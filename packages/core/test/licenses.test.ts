import { describe, it, expect } from 'vitest'
import { checkLicense } from '../src/licenses.js'

describe('checkLicense', () => {
  it('accepts an allowlisted OSI license', () => {
    expect(checkLicense('Apache-2.0')).toEqual([])
  })

  it('accepts an allowlisted Creative Commons license', () => {
    expect(checkLicense('CC-BY-4.0')).toEqual([])
  })

  it('rejects a license not on the allowlist', () => {
    const findings = checkLicense('Proprietary')
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('manifest.license')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/Proprietary/)
  })

  it('rejects a non-commercial license, since it blocks the intended reuse', () => {
    const findings = checkLicense('CC-BY-NC-4.0')
    expect(findings).toHaveLength(1)
  })

  it('is case sensitive, because SPDX identifiers are', () => {
    expect(checkLicense('apache-2.0')).toHaveLength(1)
  })
})
