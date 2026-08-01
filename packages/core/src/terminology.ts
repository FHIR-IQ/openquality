import type { Finding } from './report.js'

export interface CodeSystemPolicy {
  /** Human readable name, used in messages. */
  name: string
  /** Matches the code system URL as written in a CQL codesystem declaration. */
  match: RegExp
  /** Whether display text for this system can be redistributed. */
  displayAllowed: boolean
}

// The negative lookahead matters: without it the CPT arc also matches
// urn:oid:2.16.840.1.113883.6.120, a different code system entirely.
//
// Exported so scanner.ts's any-CPT-reference warning and this module's
// display-text error agree on what counts as CPT: one source of truth for the
// pattern, kept even though the two checks fire on different conditions.
export const CPT_SYSTEM = /ama-assn\.org\/go\/cpt|urn:oid:2\.16\.840\.1\.113883\.6\.12(?!\d)/i

/**
 * Per code system, because the licences differ and one blanket rule is either
 * too strict or too loose. Only systems that restrict something need an entry:
 * an unlisted system defaults to allowed, since this is a licensing filter and
 * not an allowlist of terminologies a package may use.
 */
export const CODE_SYSTEM_POLICY: CodeSystemPolicy[] = [
  {
    name: 'CPT',
    match: CPT_SYSTEM,
    displayAllowed: false,
  },
]

export function policyFor(url: string): CodeSystemPolicy | undefined {
  return CODE_SYSTEM_POLICY.find((p) => p.match.test(url))
}

export function displayAllowed(url: string): boolean {
  return policyFor(url)?.displayAllowed ?? true
}

/**
 * A CQL codesystem declaration, e.g. `codesystem "CPT": 'http://...'`. Group 1
 * is the alias used elsewhere in the file, group 2 the system URL. The alias
 * capture tolerates an escaped quote (\") the same way CODE_WITH_DISPLAY's
 * quoted fields do below: without that, an alias carrying one fails to match
 * here at all, and every code declaration against that alias goes silently
 * unchecked rather than flagged.
 *
 * Case-insensitive (`i`) for the same reason as CODE_WITH_DISPLAY below, not
 * because CQL keywords are case-insensitive - they are not.
 */
const CODESYSTEM_DECL = /^\s*codesystem\s+"((?:[^"\\]|\\.)*)"\s*:\s*'((?:[^'\\]|\\.)*)'/gim

/**
 * A CQL code declaration that carries display text:
 *   code "Name": '97804' from "CPT" display 'text'
 * Group 1 is the code, group 2 the code system alias. The alias capture uses
 * the same escape-tolerant pattern as CODESYSTEM_DECL above, so an alias
 * containing an escaped quote is captured identically in both places; if the
 * two disagreed, the alias recorded for a codesystem and the alias read off a
 * code declaration would not match as the same string, and the lookup this
 * module does between them would silently fail.
 *
 * Case-insensitive (the `i` flag), but not because CQL keywords are
 * case-insensitive: they are not. `codesystem`, `code`, `from`, and `display`
 * are fixed lowercase keywords in the grammar, and a file that spells them
 * otherwise is invalid CQL that a translator will reject. But this is a
 * licensing filter, not a CQL parser, and Level 1 does not require
 * translation, so an invalid-but-close file can still sit in a package.
 * Matching case-insensitively costs nothing and keeps such a file from
 * carrying a licensed descriptor past this check.
 */
const CODE_WITH_DISPLAY =
  /^\s*code\s+"(?:[^"\\]|\\.)*"\s*:\s*'((?:[^'\\]|\\.)*)'\s+from\s+"((?:[^"\\]|\\.)*)"\s+display\s+'(?:[^'\\]|\\.)*'/gim

/** Code system aliases declared in this CQL file, mapped to their URLs. */
export function codeSystemAliases(cql: string): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const match of cql.matchAll(CODESYSTEM_DECL)) aliases.set(match[1], match[2])
  return aliases
}

/**
 * Reports code declarations that carry display text from a code system whose
 * licence does not permit redistributing it. Only the display string is the
 * problem: a code plus a system URL is a reference, which is the same rule
 * Open Quality already applies to value sets, and the same convention FHIR
 * itself follows by publishing large terminologies with content=not-present.
 *
 * Heuristic by design, same as scanContent: a regex over CQL text, not a
 * parse of it, so it does not know about comments and will flag a
 * declaration sitting inside a `/* *\/` block too. That is intentional here -
 * the licensed descriptor bytes are present in the redistributed file
 * regardless of whether the declaration is live code - but it does mean this
 * check will miss things a parser would not and could, in principle,
 * misread a declaration it should not flag. That caveat matters more here
 * than for the CPT reference warning in scanner.ts, because this check
 * reports errors and blocks Level 1 rather than merely surfacing a warning.
 */
export function checkTerminology(path: string, content: string): Finding[] {
  if (!path.endsWith('.cql')) return []

  const restricted = new Map<string, CodeSystemPolicy>()
  for (const [alias, url] of codeSystemAliases(content)) {
    const policy = policyFor(url)
    if (policy && !policy.displayAllowed) restricted.set(alias, policy)
  }
  if (restricted.size === 0) return []

  const findings: Finding[] = []
  for (const match of content.matchAll(CODE_WITH_DISPLAY)) {
    const [, code, alias] = match
    const policy = restricted.get(alias)
    if (!policy) continue
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        `code '${code}' from "${alias}" carries display text. ${policy.name} descriptors are ` +
        `licensed and cannot be redistributed. Keep the code and the code system, remove the ` +
        `display string.`,
      path,
    })
  }
  return findings
}
