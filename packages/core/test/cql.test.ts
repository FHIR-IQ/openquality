import { describe, it, expect } from 'vitest'
import { stripComments } from '../src/cql.js'

describe('stripComments', () => {
  it('blanks a line comment but keeps the newline', () => {
    const out = stripComments('a // gone\nb')
    expect(out).toMatch(/^a {8}\nb$/)
    expect(out).not.toContain('gone')
  })

  it('blanks a block comment and keeps its newlines', () => {
    expect(stripComments('a /* one\ntwo */ b')).toBe('a       \n       b')
  })

  it('leaves the file the same length, so offsets still line up', () => {
    const cql = `library X version '1.0.0'\n// note\n/* block */\ncode "A": '1' from "S"\n`
    expect(stripComments(cql)).toHaveLength(cql.length)
  })

  it('does not touch a URL inside a single quoted string', () => {
    const cql = `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`
    expect(stripComments(cql)).toBe(cql)
  })

  it('does not touch what looks like a comment inside a quoted identifier', () => {
    const cql = `code "a // b": '1' from "S"`
    expect(stripComments(cql)).toBe(cql)
  })

  it('survives an escaped quote inside a string', () => {
    // The escaped quote must not end the string, or everything after it would
    // be read as code and the trailing comment would not be blanked.
    const cql = `define X: 'it\\'s fine' // gone`
    const out = stripComments(cql)
    expect(out.startsWith(`define X: 'it\\'s fine'`)).toBe(true)
    expect(out).not.toContain('gone')
    expect(out).toHaveLength(cql.length)
  })

  it('survives an unterminated block comment', () => {
    expect(stripComments('a /* never closed')).toBe('a                ')
  })

  it('survives an unterminated string', () => {
    const cql = `define X: 'never closed`
    expect(stripComments(cql)).toBe(cql)
  })

  it('leaves a file with no comments untouched', () => {
    const cql = `library X version '1.0.0'\ndefine "A": true\n`
    expect(stripComments(cql)).toBe(cql)
  })
})
