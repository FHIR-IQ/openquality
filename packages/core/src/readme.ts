import type { Finding } from './report.js'

export const REQUIRED_SECTIONS = ['intent', 'known limitations', 'provenance'] as const

/** Returns lowercased text of every ATX heading in the document. */
function headings(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.match(/^#{1,6}\s+(.*)$/)?.[1])
    .filter((text): text is string => !!text)
    .map((text) => text.trim().toLowerCase())
}

export function checkReadmeSections(readme: string | undefined): Finding[] {
  const found = readme ? headings(readme) : []
  return REQUIRED_SECTIONS
    .filter((required) => !found.some((h) => h.includes(required)))
    .map((required) => ({
      check: 'readme.sections' as const,
      severity: 'error' as const,
      message: `README is missing a "${required}" section, which Level 1 requires`,
      path: 'README.md',
    }))
}
