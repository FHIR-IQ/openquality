import { codeSystemAliases, parseHeader, parseIncludes, policyFor } from '@openquality/core'

// parseHeader and parseIncludes moved to @openquality/core so the CLI can reach
// them without depending on the importer. Re-exported here because this
// module's own callers, and its tests, address them at this path.
export { parseHeader, parseIncludes } from '@openquality/core'
export type { CqlHeader, CqlInclude } from '@openquality/core'

export interface CqlValueSet {
  name: string
  url?: string
  oid?: string
}

const VALUESET = /^valueset\s+"([^"]+)"\s*:\s*'([^']+)'/gm

/** Dotted decimal OID, matching the rule in @openquality/core valuesets.ts. */
const OID = /^\d+(\.\d+)+$/
const URN_OID = 'urn:oid:'

/**
 * Derives the OID from a value set reference. Upstream writes canonical URLs
 * ending in the OID; hand-written CQL in this repository writes urn:oid.
 * Both forms appear, so both are handled here rather than at the call site.
 */
export function oidFrom(reference: string): string | undefined {
  if (reference.startsWith(URN_OID)) {
    const candidate = reference.slice(URN_OID.length)
    return OID.test(candidate) ? candidate : undefined
  }
  const last = reference.split('/').pop() ?? ''
  return OID.test(last) ? last : undefined
}

export function parseValueSets(cql: string): CqlValueSet[] {
  return [...cql.matchAll(VALUESET)].map((m) => {
    const reference = m[2]
    return {
      name: m[1],
      // A urn:oid reference is not a URL, and the manifest's valuesets.referenced
      // check rejects a url that is not http or https.
      url: reference.startsWith(URN_OID) ? undefined : reference,
      oid: oidFrom(reference),
    }
  })
}

export interface StripResult {
  cql: string
  /** One entry per removed display, as "<system name> <code>". */
  removed: string[]
}

/**
 * A code declaration carrying display text. Group 1 is everything up to and
 * including the code system alias, so a replacement can keep it and drop only
 * the display clause. Group 2 is the code, group 3 the alias.
 */
const CODE_WITH_DISPLAY =
  /^(\s*code\s+"(?:[^"\\]|\\.)*"\s*:\s*'((?:[^'\\]|\\.)*)'\s+from\s+"((?:[^"\\]|\\.)*)")\s+display\s+'(?:[^'\\]|\\.)*'/gim

/**
 * Removes display text for code systems whose licence does not permit
 * redistributing it, keeping the code and the code system. Metadata only, so
 * the CQL stays valid. Removing the code declaration outright would break every
 * definition that references it.
 */
export function stripRestrictedDisplays(cql: string): StripResult {
  const restricted = new Map<string, string>()
  for (const [alias, url] of codeSystemAliases(cql)) {
    const policy = policyFor(url)
    if (policy && !policy.displayAllowed) restricted.set(alias, policy.name)
  }
  if (restricted.size === 0) return { cql, removed: [] }

  const removed: string[] = []
  const rewritten = cql.replace(CODE_WITH_DISPLAY, (match, head: string, code: string, alias: string) => {
    const system = restricted.get(alias)
    if (!system) return match
    removed.push(`${system} ${code}`)
    return head
  })

  return { cql: rewritten, removed }
}
