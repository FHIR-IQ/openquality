---
id: corpus-2026-004
scope: corpus
type: defect
measurementPeriod: 2026
status: resolved
categories: [tooling, terminology, security]
reporter: anonymous
---

## Summary

A symlink is neither a file nor a directory to `readdir`, so the package file
walk skipped it. Licensed content could therefore sit inside a package behind an
undeclared symlink and validate clean at Level 1, and `oq pack` dropped it from
the tarball without saying so.

## Detail

Found by an outside reviewer who was asked to attack the path handling. The
declared-artifact defences held: symlinks named in the manifest, a symlinked
directory swapped in for `cql/`, a circular symlink loop, and Windows-style,
URL-encoded, and `file://`-style paths were all rejected cleanly, with no
crashes or hangs. `resolveInside` in `validate.ts` does its job.

The gap was in what nobody declared. `listPackageFiles` in
`packages/core/src/pack.ts` walked the directory with
`readdir(dir, { withFileTypes: true })` and branched on `isDirectory()` then
`isFile()`. `readdir` does not follow links, so a symlink dirent answers false
to both and fell out of the walk entirely.

That mattered because of what the walk feeds. `validatePackage` scans every file
the walk returns, deliberately, so that content the corpus cannot host cannot
ride along in a file the manifest never mentions. The comment above
`listPackageFiles` said so in as many words. The function did not do it.

The reviewer proved it the direct way: put a CQL file carrying a CPT display
descriptor outside the package, symlink to it from `cql/`, declare nothing.
`oq validate` reported **Level 1, no findings**. `content.forbidden` is the only
error-severity content check this project has, and it never opened the file.

Two consequences, and the second is the one that would have bitten first:

1. `oq pack` built a tarball that did not match the directory it was given.
2. Git is the distribution channel today, and git stores symlinks. So the link
   and its target travelled with the repository even though the validator had
   declared the package clean, and a reviewer reading a pull request diff had no
   signal that a symlink was in the tree at all.

## Resolution

Resolved. A package must contain only real files.

`pack.ts` now tests `isSymbolicLink()` first and collects links through
`listPackageSymlinks`, which is separate from `listPackageFiles` so the two sets
stay disjoint and the tarball is never asked to carry something it cannot
represent. `packPackage` refuses to pack a package containing one, naming each
offender, rather than silently omitting it.

`validate.ts` runs `package.symlinks` immediately before `content.forbidden`,
because it is what makes that check's promise true, and reports each link as an
**error**. Symlinks are reported rather than followed: following one would mean
deciding what a link pointing outside the package means, and no answer to that
is both safe and useful. A package is a self-contained unit of exchange, and a
tarball cannot carry a link to a file the recipient does not have.

The general lesson is not about symlinks. A directory walk that enumerates by
asking "is this a file?" answers a narrower question than "what is in here?",
and the difference is exactly where something hides. Any check whose guarantee
rests on having seen everything should fail closed on an entry it cannot
classify, rather than skipping it.
