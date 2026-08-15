/**
 * Reading identity out of CQL source text.
 *
 * This lives in core rather than in the importer because two packages now need
 * it and the dependency direction only allows one of them to reach the other.
 * The importer parses headers to plan an import; the FHIR package emitter
 * parses them to name a Library resource and to state what it depends on.
 * core already parses CQL text in terminology.ts, so this is where it belongs.
 *
 * Regexes over source rather than a parse, for the same reason terminology.ts
 * gives: Level 1 does not require translation, so a file that is close to valid
 * CQL but not quite still has to be readable here.
 */

export interface CqlHeader {
  name: string
  version: string
  model?: string
  modelVersion?: string
}

export interface CqlInclude {
  library: string
  version: string
  alias?: string
}

const LIBRARY = /^library\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'/m
const USING = /^using\s+([A-Za-z0-9_]+)(?:\s+version\s+'([^']+)')?/m
const INCLUDE = /^include\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'(?:\s+called\s+([A-Za-z0-9_]+))?/gm

export function parseHeader(cql: string): CqlHeader | undefined {
  const library = cql.match(LIBRARY)
  if (!library) return undefined
  const using = cql.match(USING)
  return { name: library[1], version: library[2], model: using?.[1], modelVersion: using?.[2] }
}

export function parseIncludes(cql: string): CqlInclude[] {
  return [...cql.matchAll(INCLUDE)].map((m) => ({ library: m[1], version: m[2], alias: m[3] }))
}

/**
 * Replaces every comment with spaces, keeping the file the same length and the
 * same shape.
 *
 * This exists because the alternative did not survive contact. Matching
 * "whitespace or a comment" between tokens, as an alternation of whitespace,
 * a block comment and a line comment, is
 * ambiguous: a newline at the end of a line comment can be consumed by the
 * comment branch or by the whitespace branch, so a run of `n` comment lines has
 * 2^n ways to match. On a failing match the engine tries all of them. Reported
 * by an outside contributor whose file had a block of empty `// ` lines: 20 of
 * them took a quarter of a second, 40 would take hours, and the validator
 * appeared to hang with no error.
 *
 * A scanner rather than a regex, so the cost is linear in the length of the
 * file and provably so.
 *
 * String aware, which is the part that is easy to get wrong: a CQL file is full
 * of `'http://...'`, and a naive strip of `//` to end of line destroys every
 * code system URL in the file and takes the checks that read them with it.
 */
export function stripComments(cql: string): string {
  const out = cql.split('')
  const n = cql.length
  let i = 0

  while (i < n) {
    const c = cql[i]

    // Single quotes hold strings, double quotes hold identifiers. Neither can
    // contain a comment, and both can contain something that looks like one.
    if (c === "'" || c === '"') {
      const quote = c
      i++
      while (i < n) {
        if (cql[i] === '\\') {
          i += 2
          continue
        }
        if (cql[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }

    if (c === '/' && cql[i + 1] === '*') {
      const start = i
      i += 2
      while (i < n && !(cql[i] === '*' && cql[i + 1] === '/')) i++
      i = Math.min(i + 2, n)
      // Newlines survive, so line numbers and the `m` flag still behave.
      for (let k = start; k < i; k++) if (out[k] !== '\n') out[k] = ' '
      continue
    }

    if (c === '/' && cql[i + 1] === '/') {
      const start = i
      while (i < n && cql[i] !== '\n') i++
      for (let k = start; k < i; k++) out[k] = ' '
      continue
    }

    i++
  }

  return out.join('')
}
