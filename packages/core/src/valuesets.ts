import type { Finding } from './report.js'

/** Dotted decimal OID: digit groups separated by single dots, no empty groups. */
const OID = /^\d+(\.\d+)+$/

const URN_OID_PREFIX = 'urn:oid:'

export interface ValueSetRef {
  oid?: string
  url?: string
  source?: string
}

export function checkValueSetRefs(refs: ValueSetRef[] | undefined): Finding[] {
  if (!refs) return []
  const findings: Finding[] = []

  for (const ref of refs) {
    // The schema deliberately allows an entry with neither field so that this
    // check owns the rule and the finding carries the right CheckId.
    if (!ref.oid && !ref.url) {
      findings.push({
        check: 'valuesets.referenced',
        severity: 'error',
        message: 'each valueSets entry must have an oid or a url',
        path: 'openquality.yaml',
      })
    }
    // Called out separately because CQL writes value sets as
    // 'urn:oid:2.16.840...', so copying one straight across from the package's
    // own .cql file into the manifest is the likeliest mistake an author makes.
    // A bare "not a valid OID" would leave them staring at an identifier that
    // looks correct to them.
    if (ref.oid?.startsWith(URN_OID_PREFIX)) {
      findings.push({
        check: 'valuesets.referenced',
        severity: 'error',
        message:
          `value set oid "${ref.oid}" must not carry the urn:oid: prefix. ` +
          `CQL writes them that way, the manifest does not: use ` +
          `${ref.oid.slice(URN_OID_PREFIX.length)}`,
        path: 'openquality.yaml',
      })
    } else if (ref.oid && !OID.test(ref.oid)) {
      findings.push({
        check: 'valuesets.referenced',
        severity: 'error',
        message: `"${ref.oid}" is not a valid OID`,
        path: 'openquality.yaml',
      })
    }
    if (ref.url && !/^https?:\/\//.test(ref.url)) {
      findings.push({
        check: 'valuesets.referenced',
        severity: 'error',
        message: `value set url "${ref.url}" must be http or https`,
        path: 'openquality.yaml',
      })
    }
  }

  return findings
}
