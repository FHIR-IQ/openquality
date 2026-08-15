import type { Finding } from './report.js'

export const REQUIRED_SECTIONS = ['intent', 'known limitations', 'provenance'] as const

/** Escapes a literal so it can be embedded in a RegExp. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Lowercased text of every heading, both ATX (`## Foo`) and Setext (`Foo` sitting
 * above a rule of `=` or `-`). Setext is valid Markdown and shows up in
 * hand-written READMEs, so ignoring it would falsely block a compliant package.
 */
function headings(markdown: string): string[] {
  // Split on both line endings, not just LF.
  //
  // Reported by the first outside contributor, working on Windows: a README
  // with all three required sections was reported as having none of them.
  // Splitting on '\n' alone leaves a trailing '\r' on every line, and `.` does
  // not match '\r', so `(.*)$` in the ATX pattern below can never reach the end
  // of the string and no heading matches. The package drops to Level 0 while
  // looking perfectly correct in an editor, which is about the worst way for a
  // check to fail.
  const lines = markdown.split(/\r?\n/)
  const found: string[] = []

  lines.forEach((line, index) => {
    const atx = line.match(/^#{1,6}\s+(.*)$/)
    if (atx) {
      found.push(atx[1].trim().toLowerCase())
      return
    }
    const underline = lines[index + 1]
    if (line.trim() && !line.startsWith('#') && underline && /^(=+|-+)\s*$/.test(underline)) {
      found.push(line.trim().toLowerCase())
    }
  })

  return found
}

export function checkReadmeSections(readme: string | undefined): Finding[] {
  const found = readme ? headings(readme) : []
  return REQUIRED_SECTIONS
    .filter((required) => {
      // Whole-word rather than substring. "Unintentional Data Loss" contains
      // "intent", and letting that satisfy the requirement would score a package
      // Level 1 without it ever documenting what it measures. Word boundaries
      // still admit the natural variations, "Intent and Scope" or "1. Intent".
      const pattern = new RegExp(`\\b${escapeRegExp(required)}\\b`)
      return !found.some((heading) => pattern.test(heading))
    })
    .map((required) => ({
      check: 'readme.sections' as const,
      severity: 'error' as const,
      message: `README is missing a "${required}" section, which Level 1 requires`,
      path: 'README.md',
    }))
}
