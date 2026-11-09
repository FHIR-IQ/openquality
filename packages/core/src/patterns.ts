import type { Finding } from './report.js'
import { stripComments } from './cql.js'

/**
 * CMS QMD authoring patterns that can be read from CQL text.
 *
 * Source: the CMS FHIR Quality Measure Development IG,
 * https://build.fhir.org/ig/cqframework/cms-qmd/pattern_fhir.html. Only rules
 * a text match can find are here; the rest need a translator.
 *
 * Never an error. The patterns are guidance an author is asked to apply, the IG
 * is a continuous build, and the seed corpus predates it, so these inform a
 * contributor without blocking a pull request or a level.
 */
const PATTERNS_URL = 'https://build.fhir.org/ig/cqframework/cms-qmd/pattern_fhir.html'

const USING_NO_VERSION = /^\s*using\s+([A-Za-z0-9_.]+)(?:\s+called\s+[A-Za-z0-9_]+)?\s*$/gm
const STRING_MEMBERSHIP = /'[^'\n]*'\s+in\s+"/g
const TERMINOLOGY_CONTAINS = /\.(code|category|type|class|reasonCode)\s+contains\b/g
const UNQUALIFIED_RETRIEVE = /\[[A-Z][A-Za-z0-9_]*\s*[:\]]/g

const USING = /^\s*using\s+[A-Za-z0-9_.]+/gm

/**
 * Blanks the inside of every string literal and quoted identifier, keeping the
 * quotes and the length. A unit such as `'mm[Hg]'` or a code display such as
 * `"Hip Disability [HOOS]"` otherwise reads as a retrieve.
 */
function maskQuoted(cql: string): string {
  return cql.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, (q) => q[0] + ' '.repeat(q.length - 2) + q[q.length - 1])
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

export function checkCqlPatterns(path: string, source: string): Finding[] {
  const cql = stripComments(source)
  const findings: Finding[] = []
  const warn = (index: number, message: string) =>
    findings.push({ check: 'cql.patterns', severity: 'warning', path, message: `line ${lineOf(cql, index)}: ${message}` })

  for (const m of cql.matchAll(USING_NO_VERSION)) {
    warn(m.index!, `\`using ${m[1]}\` has no version. The CMS QMD patterns require one: the model declaration "SHALL include a version". ${PATTERNS_URL}`)
  }
  for (const m of cql.matchAll(STRING_MEMBERSHIP)) {
    warn(m.index!, `likely string-based membership testing (a string tested with \`in\` against a named value set; ignore this if the right side is a list of strings). The CMS QMD patterns say it "SHOULD NOT be used"; compare a code with \`~\` or \`in\`. ${PATTERNS_URL}`)
  }
  for (const m of maskQuoted(cql).matchAll(TERMINOLOGY_CONTAINS)) {
    warn(m.index!, `\`contains\` on the terminology-valued element \`${m[1]}\`. The CMS QMD patterns say not to; use \`includesCode()\` or \`in\`. ${PATTERNS_URL}`)
  }

  // The IG's condition, kept: "When multiple models are included in a library,
  // qualifying the name of the type with the model name is a best-practice".
  const models = [...cql.matchAll(USING)].length
  const unqualified = models > 1 ? [...maskQuoted(cql).matchAll(UNQUALIFIED_RETRIEVE)].length : 0
  if (unqualified > 0) {
    findings.push({
      check: 'cql.patterns',
      severity: 'info',
      path,
      message:
        `${unqualified} ${unqualified === 1 ? 'retrieve is' : 'retrieves are'} not qualified with the model name ` +
        `(for example \`[QICore.Encounter]\`), in a library that declares ${models} models. The CMS QMD patterns ` +
        `call qualifying a best practice when a library includes more than one model. ${PATTERNS_URL}`,
    })
  }
  return findings
}
