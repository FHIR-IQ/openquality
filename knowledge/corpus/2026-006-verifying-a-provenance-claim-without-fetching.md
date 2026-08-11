---
id: corpus-2026-006
scope: corpus
type: implementation-note
status: open
categories: [packaging, provenance, tooling, security]
reporter: anonymous
---

## Summary

A community package can declare `relationship: unmodified` against any upstream
and nothing checks it. The CI job that makes that claim verifiable today only
covers the 53 seeded packages, because it works by re-running the importer.

A design for closing this without ever fetching a URL during validation is
recorded below, along with the three things that have to be settled before it is
safe to build: who is allowed to write a verification, what a receipt has to
capture when upstream history can be rewritten, and where the record lives so
the tarball still carries it. None of it is implemented.

## The problem

`checkProvenance` in `packages/core/src/provenance.ts` validates the *shape* of
a provenance block: an http upstream, a ref, an ISO date, a known relationship,
and a non-empty modifications list when the relationship is `derived`. Every one
of those rules is about form. None of them looks at the upstream.

For `measures/cms-fhir-2026/` that gap is closed from the outside: CI re-runs the
importer and fails on any diff, so `unmodified` is a checked claim rather than an
asserted one. That mechanism does not generalise, because it depends on the
content having been produced by our importer in the first place.

So a hand-authored package can say it is an unmodified copy of some upstream and
be believed. Provenance is the project's central claim, and this is the one place
it rests on trust.

## The design

Contributed by the outside reviewer who reported
[[2026-004-undeclared-symlink-hid-content-from-the-scanner]] and
[[2026-005-the-scanner-trusted-its-own-parser]]. The framing is theirs:

> Don't fetch at validate time at all. Separate proving the claim from checking
> it.

The primitive already exists. `packPackage` computes a sha256 over a
deterministic tarball, with entries sorted, mtime fixed, and ownership stripped,
so the same content yields the same digest on any machine at any time. Today
that digest is only printed and used to name the tarball file. Bind provenance
to it instead.

**Proving**, once, in CI, when a pull request declares a provenance block:

1. Fetch the one declared target, and nothing else. Sandboxed, host
   allowlisted, no redirects off the allowlist, no private IP ranges, size and
   time capped.
2. Re-derive the package the way the importer does today.
3. Diff it against what the pull request contains.
4. On a match, record the package's `packPackage` digest, along with who
   verified it and when.

**Checking**, every time, offline:

`oq validate` recomputes the local digest and compares it against the recorded
one. A match means the claim still holds. A mismatch is a hard error: the
content has drifted since the last time anyone checked it against upstream.

The properties that make this worth doing:

- **Zero network calls in the path that runs on a stranger's machine.** The
  fetch happens once, in a place we control, under constraints we set. A
  contributor running `oq validate` locally makes no requests at all.
- **It covers community packages the same way as seeded ones**, because the CI
  job keys off the declared provenance block rather than off our importer.
- **Drift becomes detectable rather than invisible.** Today, editing a file in a
  package that claims `unmodified` produces no finding outside
  `cms-fhir-2026/`. Under this design it produces a digest mismatch.

## The part that still needs deciding

Where the verification record lives. The obvious place is the manifest, as
`provenance.verifiedDigest` plus the verifier and timestamp. That works for
hand-authored packages and breaks for generated ones.

Verified rather than assumed: injecting a `verifiedDigest` field into
`measures/cms-fhir-2026/severe-obstetric-complications/openquality.yaml` and
re-running `pnpm oq-import 2026-08-01` removes it. `emitManifest` builds each
seeded manifest from the plan, so anything CI writes into one is destroyed by
the next import, and the drift job then fails on the diff. The determinism
contract and an in-manifest verification record cannot both hold.

Two ways out, neither chosen yet:

1. **A separate ledger.** A repository-level file mapping package id and version
   to a verified digest, upstream, ref, verifier, and timestamp. The generated
   manifests stay byte-identical to importer output, so the drift check is
   untouched, and the record is one file to review rather than 53 diffs. The
   cost is that a package tarball no longer carries its own verification.
2. **Teach the importer to carry it through.** `emitManifest` would read an
   existing manifest and preserve the field. That keeps the record in the
   package and gives up the property that the importer is a pure function of
   upstream content plus a date, which is what makes the drift check meaningful.

Option 1 preserves the invariant the project already depends on, so it is the
one to try first. It is not safe as stated: see the write-authority problem
below, which has to be solved before a ledger is worth building at all.

## Who is allowed to write a verification

The reviewer's response to the ledger proposal, and the most important thing in
this entry.

A ledger is a plain file in the repository, and a plain file does not enforce
who writes to it. If a row can arrive as part of an ordinary contributor's pull
request, someone can hand-write an entry claiming their package was verified,
and it reads exactly as authoritative as a row CI produced. Nothing in the
format distinguishes them.

That is **worse than the gap it was meant to close**. Today no package claims to
be verified, so a reader knows to check for themselves. A forgeable ledger
invites them to stop checking, and rewards whoever forges a row.

So the write path has to be structural rather than conventional. Either:

- the ledger is written only by a bot commit that CI makes after its own
  fetch-and-diff succeeds, with branch protection on that path so no human diff
  can touch it; or
- CI rejects any pull request that modifies a row it did not itself produce.

Either way the rule is that a verification is a thing the project performed, not
a thing a contributor asserted. That is the same distinction the corpus already
draws between `relationship: unmodified` on a seeded package, which CI
re-derives, and the same string on a community package, which nobody checks.

## Keep the validator a pure function of its directory

`validatePackage` currently touches only paths inside the directory it is given.
A ledger keyed by package id and version lives elsewhere in the repository, so
reading it means the validator has to know where the repository root is.

The reviewer's guidance, which is right: resolve that at the CLI layer, not
inside `validatePackage`. Every documented command already runs from the
repository root, so resolving at the working directory is safe, but there is no
reason to make the offline, already-tested core depend on filesystem state
outside the directory it was handed. The digest comparison is a separate check
that happens to need a second input, and it belongs where the other
repository-aware commands already live.

## A commit SHA is not immutable

Flagged from the compliance side, and it undercuts the design's foundation if
ignored. A `ref` is only as fixed as the upstream's willingness not to rewrite
history. A force-push, a deleted repository, or a retagged release leaves a
provenance block pointing at something that no longer exists or no longer holds
the bytes that were checked.

So verification should archive the fetched bytes, or at minimum their digest, as
a receipt taken at the moment of checking. Then the claim is "these bytes were
at this ref on this date, and here is what they hashed to", which survives
upstream changing its mind. Without it, a verification that succeeded once
becomes unfalsifiable later: nobody can tell whether a mismatch means the
package drifted or the upstream did.

Prior art rather than a design to invent: npm provenance attestations, SLSA, and
Sigstore all solve this shape. Worth reading before writing anything.

## The tarball cost has a fix, not a tradeoff

The objection to a ledger was that a package tarball would no longer carry its
own verification. The reviewer's answer: the ledger has to live in source
control to keep the drift check clean, but `oq pack` already produces something
that is not source-controlled.

A future publish step reads the matching ledger row and writes it into the
tarball as `.provenance.json` alongside the artifact, at pack time, never
touching `openquality.yaml`. That is the same move as the ledger itself, applied
at the packaging boundary instead of the source boundary: the record travels
with the artifact without ever entering the generated manifest.

Nothing needs building until a registry exists. It is recorded now so the ledger
is not designed as though the tarball problem were permanent.

## Still undecided

What a verified digest means once a package has more than one verification,
whether an expired or very old verification should warn, and whether
`relationship: derived` can be verified at all or only ever attested.
