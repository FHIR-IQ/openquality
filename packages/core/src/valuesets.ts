import type { Finding } from './report.js'

/** Dotted decimal OID: digit groups separated by single dots, no empty groups. */
const OID = /^\d+(\.\d+)+$/

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
    if (ref.oid && !OID.test(ref.oid)) {
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
