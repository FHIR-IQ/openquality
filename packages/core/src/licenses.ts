import type { Finding } from './report.js'

/**
 * SPDX identifiers Open Quality accepts. Deliberately short. Non-commercial
 * and no-derivatives variants are excluded because they block the reuse the
 * registry exists to enable.
 */
export const ALLOWED_LICENSES = [
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

export function checkLicense(license: string): Finding[] {
  if ((ALLOWED_LICENSES as readonly string[]).includes(license)) return []
  return [{
    check: 'manifest.license',
    severity: 'error',
    message:
      `license "${license}" is not on the Open Quality allowlist. ` +
      `Allowed: ${ALLOWED_LICENSES.join(', ')}`,
    path: 'openquality.yaml',
  }]
}
