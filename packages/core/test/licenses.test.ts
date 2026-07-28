import { describe, it, expect } from 'vitest'
import { checkLicense, ALLOWED_LICENSES } from '../src/licenses.js'

/**
 * An independent copy of the allowlist, deliberately NOT derived from
 * ALLOWED_LICENSES. Driving the cases off the source would be tautological:
 * deleting an entry would delete its own test and the suite would stay green.
 * Changing the licensing policy should require editing this list too.
 */
const EXPECTED_LICENSES = [
  'Apache-2.0',
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'LGPL-3.0-only',
  'MPL-2.0',
] as const

describe('checkLicense', () => {
  it('allows exactly the documented set, no more and no less', () => {
    expect([...ALLOWED_LICENSES]).toEqual([...EXPECTED_LICENSES])
  })

  it.each(EXPECTED_LICENSES)('accepts %s', (license) => {
    expect(checkLicense(license)).toEqual([])
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
