---
id: corpus-2026-005
scope: corpus
type: defect
measurementPeriod: 2026
status: resolved
categories: [tooling, terminology, security]
reporter: anonymous
---

## Summary

Two ways past the content scanner, both found with real, declared files. Each
worked by making a parser fail to recognise something rather than by hiding it:
a duplicate key that stopped the YAML parser reading an embedded expansion, and
a CQL comment that stopped a regex matching a licensed descriptor. In both
cases the scanner read the failure as "nothing here".

## Detail

Found by the outside reviewer who reported [[2026-004-undeclared-symlink-hid-content-from-the-scanner]],
after being pointed at these two checks as the known soft spots. No symlinks
this time. Both files were ordinary, declared members of the package.

### The expansion the parser would not read

A genuine `ValueSet` with `expansion.contains`, real SNOMED codes and display
text, carrying one duplicated key: `resourceType` written twice. That is a
plausible copy-paste typo, not an exotic attack. A JSON parser accepts it and
takes the last occurrence. YAML forbids duplicate keys, so `parseYaml` threw,
and `hasEmbeddedExpansion` returned `false` on any thrown error.

The package validated at **Level 1 with no findings**, carrying the expansion.

### The descriptor the regex would not match

`CODE_WITH_DISPLAY` in `terminology.ts` required the literal sequence
`display`, whitespace, then a quoted string. A CQL block comment between the
keyword and the string is valid CQL and changes nothing about the bytes being
redistributed, and the regex stopped matching:

```cql
code "N": '97804' from "CPT" display /* x */ 'Medical nutrition therapy'
```

The file still drew the generic "references CPT" warning from the separate
system-level check, so it did not look silent. But warnings do not move the
conformance level. The check that blocks Level 1 never fired, and the licensed
descriptor shipped.

The same hole existed in `CODESYSTEM_DECL`, and there it was worse: an
unmatched codesystem declaration means the alias is never recorded,
`checkTerminology` returns early, and **no** code declaration in that file is
examined.

## Resolution

Resolved. The reviewer's framing was the useful part: the tool trusted its own
parser more than it should.

Their suggested fix was to make any parse failure a finding of its own. That
cannot be done as stated, and measuring it is what showed why: **360 of the 415
files in the corpus do not parse as YAML**, because 302 are CQL and 58 are
Markdown. A rule keyed on parse failure would fail almost every package.

So the scanner fails closed on the signal rather than on the parse. A file whose
raw text carries both a `ValueSet` resourceType and an `expansion` key is an
error whenever the structural check has not already reported it, whether the
file failed to parse or parsed into a shape the walk does not recognise. The
markers are matched as key syntax rather than as bare words, so prose about
value sets does not trip them; `TERMINOLOGY.md` discusses expansions at length
and stays clean.

For the CQL patterns, both regexes now accept whitespace, block comments, or
line comments wherever they previously demanded whitespace. Comments are
tolerated between tokens but still not stripped from the file, which preserves
the existing deliberate behaviour of flagging a declaration that sits inside a
comment: the licensed bytes are present in the redistributed file either way.

The comment-aware patterns were timed against pathological input, since they
run over files strangers submit. A 200,000-character whitespace run, an
unterminated block comment, and 20,000 unclosed comment openers each complete
in under two milliseconds.

## The general lesson

A checker that answers "did I find the bad thing?" quietly answers "no" when it
should answer "I could not look." Those are different, and only one of them is
safe to treat as a pass. Any check whose guarantee depends on having understood
a file should distinguish *parsed and clean* from *could not parse*, and decide
deliberately which way the second one falls.

It is the same defect as [[2026-004-undeclared-symlink-hid-content-from-the-scanner]],
one layer up: there, a directory entry the walk could not classify was skipped;
here, a file the parser could not read was passed.
