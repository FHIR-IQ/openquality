import type { Finding } from './report.js'

/** Dotted decimal OID: digit groups separated by single dots, no empty groups. */
const OID = /^\d+(\.\d+)+$/

const URN_OID_PREFIX = 'urn:oid:'

export interface ValueSetRef {
  oid?: string
  url?: string
  source?: string
}

/**
 * Rules about the list as a whole, as opposed to the shape of one entry.
 *
 * Naming the same value set twice is redundant rather than wrong: the package
 * still resolves to exactly the same terminology, so it is a warning and does
 * not move the conformance level. It is worth saying, because it is invisible
 * on a list of forty OIDs and it is what a copy-paste produces. It also happens
 * legitimately upstream, where one value set is declared under two CQL aliases,
 * so rejecting it outright would fail packages that are correct.
 *
 * Giving one OID two different canonical URLs is an error, because the manifest
 * then asserts two identities for one value set and a resolver has no basis for
 * choosing. That is a claim the package cannot support, which is the line this
 * project draws between a warning and an error.
 *
 * Iteration follows manifest order, so the findings are deterministic.
 */
function checkListConsistency(refs: ValueSetRef[]): Finding[] {
  const findings: Finding[] = []
  const urlsByOid = new Map<string, Set<string>>()
  const counts = new Map<string, number>()

  for (const ref of refs) {
    // An entry with neither is already reported per-entry; it has no identity
    // to count, and counting it as "undefined" would group unrelated entries.
    const key = ref.oid ?? ref.url
    if (key === undefined) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)

    if (ref.oid && ref.url) {
      const urls = urlsByOid.get(ref.oid) ?? new Set<string>()
      urls.add(ref.url)
      urlsByOid.set(ref.oid, urls)
    }
  }

  for (const [oid, urls] of urlsByOid) {
    if (urls.size < 2) continue
    findings.push({
      check: 'valuesets.referenced',
      severity: 'error',
      message:
        `value set oid "${oid}" is declared with ${urls.size} different urls ` +
        `(${[...urls].sort().join(', ')}). One OID identifies one value set.`,
      path: 'openquality.yaml',
    })
  }

  for (const [key, count] of counts) {
    if (count < 2) continue
    findings.push({
      check: 'valuesets.referenced',
      severity: 'warning',
      message:
        `value set "${key}" is declared ${count} times. The manifest lists value sets, ` +
        `not the names your logic gives them, so declare each one once.`,
      path: 'openquality.yaml',
    })
  }

  return findings
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

  findings.push(...checkListConsistency(refs))

  return findings
}
