# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install
pnpm test                          # vitest run, whole workspace
pnpm test:watch
pnpm typecheck                     # tsc -p tsconfig.json
pnpm oq validate <package-dir>     # one package, prints findings and level
pnpm oq validate-all measures/cms-fhir-2026 measures/community
pnpm oq pack <package-dir>
pnpm oq fhir-package <package-dir>   # emit a FHIR NPM .tgz for CQL Studio et al
pnpm oq fhir-bundle <package-dir>    # emit the CRMI artifact Bundle ($package shape)
pnpm oq-import 2026-08-01          # regenerate the seed corpus (see below)
node --import tsx packages/mcp/src/stdio.ts --root .   # MCP server over stdio, this clone
pnpm --filter @openquality/mcp build                   # one-file npm build in packages/mcp/dist
```

Single test file or single test:

```bash
pnpm vitest run packages/core/test/terminology.test.ts
pnpm vitest run packages/core/test/manifest.test.ts -t "accepts qi-core"
```

Requires Node 22 and pnpm (pinned via `packageManager` in `package.json`).
Vitest collects `packages/*/test/**/*.test.ts` and `tools/test/**/*.test.ts`, so
a new test file must live in a workspace package's `test/` directory or in
`tools/test/`.

## What this project is

An open corpus of healthcare quality measures plus a typed record of what
implementers have learned about each one. Not a hosted registry — git is the
distribution channel today. Read `VISION.md` for the problem and goals, and
`docs/superpowers/specs/` for design rationale (the 2026-08-01 seed-corpus spec
is current; the 2026-07-27 registry design is partially superseded and says so).

**The project's credibility rests on being precise about licensing and
provenance.** Overstating a rule in documentation is treated as a defect equal
to understating it in code. Never make a claim in a README, the site, or a
manifest that the code does not enforce or that you have not verified.

## Architecture

Four workspace packages, one dependency direction: `importer` → `core`,
`cli` → `core`, `mcp` → `core`.

### `packages/core` — validation

`validatePackage(dir)` in `validate.ts` is the entry point. It runs a fixed
sequence of checks, each owned by its own module, each returning `Finding[]`:

| Module | Owns |
|---|---|
| `manifest.ts` | Zod schema for `openquality.yaml` |
| `licenses.ts` | SPDX allowlist |
| `provenance.ts` | Upstream provenance block rules |
| `valuesets.ts` | Value set reference format |
| `readme.ts` | Required README sections |
| `pack.ts` | The file walk, the rule that a package holds only real files, and deterministic tarballs |
| `cql.ts` | Reading library name, version and includes out of CQL source |
| `fhir.ts` | FHIR output: `Library` resources, the NPM package (`package.json`, `.index.json`), and the CRMI artifact Bundle. Both containers are built from one member list so they cannot diverge |
| `scanner.ts` / `terminology.ts` | Content the corpus cannot host |
| `level.ts` | Maps checks → conformance level |
| `report.ts` | `CheckId` union, `Finding`, `Severity` |

Three conventions that are load-bearing. Violating them produces subtly wrong
behavior rather than test failures:

1. **Semantic rules never live in the Zod schema.** A schema failure is tagged
   `manifest.schema` and aborts the run before other checks execute, so the
   author sees one misattributed error instead of every problem at once. The
   schema stays permissive (all fields optional, no `.refine`); a dedicated
   module owns the rules and tags findings with its own `CheckId`. See the
   comments above `ValueSetSchema` and `ProvenanceSchema` in `manifest.ts`.
2. **Findings, not exceptions.** Validation code returns `Finding[]` and never
   throws. It runs over packages submitted by strangers.
3. **Only `severity: 'error'` changes the conformance level.** `level.ts` uses
   `hasError`. A warning never blocks a level, so promoting a rule from warning
   to error is a real behavior change.

Adding a check means: add the `CheckId` to `report.ts`, write the module, call
it from `validate.ts` (pushing the id onto `checksRun`), and add it to
`LEVEL_1_CHECKS` in `level.ts` if it gates Level 1. Note `test/level.test.ts`
keeps a hand-maintained `L1_CHECKS` fixture mirroring the real list.

**Level 2 is unreachable today.** `cql.translate`, `fhir.validate`, and
`sql.parse` exist in the `CheckId` union but nothing implements them, so every
package sits at Level 1. This is deliberate and documented; do not fake it.

### `packages/importer` — the seed corpus generator

Generates `measures/cms-fhir-2026/` from a pinned upstream commit of the CC0
`cqframework/ecqm-content-qicore-2025`. Only `upstream.ts` touches the network;
everything else is a pure function over strings, which is what makes it testable
without a fixture repo.

Flow: `upstream.ts` (fetch/extract, cached in `.cache/`) → `measure.ts` (read
FHIR `Measure`) → `cql.ts` (parse headers, strip licensed display text) →
`naming.ts` (slug, semver) → `plan.ts` (decide import vs. skip; resolve included
libraries transitively) → `emit.ts` (manifest + README text) → `run.ts`
(orchestrate, write files, generate `measures/import-report.md`).

**Determinism is a hard requirement.** CI re-runs the importer and fails on any
diff against the committed tree — that check is what makes each package's
`relationship: unmodified | derived` a verified claim rather than an assertion.
Consequences for anyone editing the importer:

- The retrieval date is a CLI argument, never read from the clock.
- Sort anything derived from directory reads or `Set`/`Map` iteration.
- Output is written with LF endings (`toLf` in `run.ts`); upstream ships CRLF,
  and `.gitattributes` normalizes to LF, so writing CRLF leaves 152 files
  permanently dirty in `git status`.
- **Never hand-edit a generated package.** Change the importer and re-run.
- `runImport` clears generated *subdirectories* only —
  `measures/cms-fhir-2026/README.md` is hand-authored and must survive.

Verify a change with `pnpm oq-import 2026-08-01 && git diff --exit-code -- measures/`.
The golden fixture in `packages/importer/test/fixtures/` catches emit changes in
under a second without the ~450 MB download.

### `packages/mcp` — the corpus over MCP

A read-only MCP server with five tools (`search_measures`, `get_measure`,
`get_artifact`, `get_bundle`, `known_issues`). Design:
`docs/superpowers/specs/2026-10-12-mcp-service-design.md`.

- Handlers in `tools.ts` are pure over a `CorpusSource` (`source.ts`):
  `FsSource` for a clone and the tests, `HttpSource` for raw GitHub at a ref.
  Tests run against the real repository with no network.
- The server reads only what `site/index.json` lists (`catalogue.ts`). It is a
  reader of the published catalogue, so `pnpm build-library` must run before a
  new package or entry is visible to it.
- `get_bundle` builds the CRMI Bundle on request. A test holds it equal to
  `buildPackageBundle` over the same files for every package. Bundles are not
  committed (13 MB for 54 packages).
- Every result ends with `footer()` in `tools.ts`: ref, license, content policy.
  Keep it in step with `TERMINOLOGY.md`.
- `tools.ts` imports `core/src/fhir.ts` and `manifest.ts` by relative path, not
  through core's index, so the server does not pull in `tar`.
- Hosted at `/mcp`: `site/api/mcp.ts` is a Vercel function (stateless Streamable
  HTTP, `http.ts`) that reads raw GitHub at `VERCEL_GIT_COMMIT_SHA`. The handler
  answers GET itself with 405: in stateless mode the SDK transport would open an
  SSE stream that never closes. Vercel's root directory is `site/`, so
  `site/vercel.json` installs from the workspace root, and its `ignoreCommand`
  also watches `packages/mcp`, `packages/core`, `measures/` and `knowledge/`:
  a skipped deploy keeps serving the previous commit. Vercel type-checks files
  outside `site/` without strict mode, so narrow unions in a way that compiles
  both ways (see `readManifest`).
- Releasing: bump the version in `packages/mcp/package.json`, `SERVER_VERSION`
  in `server.ts`, and both versions in `server.json` (a test holds all four
  equal), then `npm publish --access public` in `packages/mcp` (2FA, so the
  maintainer runs it), then `mcp-publisher publish` there. The registry name
  `us.openquality/mcp` is proven by `site/.well-known/mcp-registry-auth` (and
  a matching DNS TXT record); the Ed25519 signing key lives outside the repo
  with the maintainer. Log in with `mcp-publisher login http --domain
  openquality.us --private-key "$(openssl pkey -in KEY.pem -outform DER | tail -c
  32 | xxd -p -c 64)"`. The registry docs' `-text | grep priv:` form breaks
  under OpenSSL 4. Do not delete the `.well-known` file.

### Content policy

Enforced, not just documented. `terminology.ts` holds a per-code-system policy:
CPT display descriptors are a Level 1 **error** (code and code system may be
referenced), while LOINC and SNOMED CT display text is permitted. Value sets are
always referenced by OID or canonical URL and never embedded. No HEDIS logic,
ever — NCQA licensing excludes it permanently. `TERMINOLOGY.md` is the
user-facing statement of these rules and must stay in sync with the code.

Twelve CPT declarations across six upstream CQL files are stripped of their
`display` clauses at import; the affected packages are marked `derived` with the
exact codes named in `modifications`.

## Repository layout notes

- `measures/cms-fhir-2026/` is **generated**. `measures/community/` is
  hand-authored.
- `knowledge/` holds typed interpretation issues, defects, and test cases keyed
  to a measure and version. Format is in `knowledge/README.md`. Nothing
  currently validates its front matter.
- `docs/strategy/` and `docs/outreach/` are gitignored planning material and are
  not part of the public repository.
- `site/mcp-setup.html` is hand-authored; the rest of the site pages and
  `site/index.json` are generated by `pnpm build-library`.
- `ci.yml` has three jobs: `test`, `validate-corpus` (Level 1 floor, the
  contributor template, plus a CPT-display grep), and `drift`. There is no JVM
  and no CQL translation step.
- Two more workflows give contributors a browser-only path.
  `pr-validate.yml` runs `tools/pr-report.ts` over the packages a pull request
  touches and uploads the Markdown; `pr-comment.yml` posts it. They are split
  on purpose: a fork's pull request gets a read-only token, so the job that
  runs contributor code cannot comment, and the job that comments must never
  check out contributor code. Renaming `pr-validate.yml`'s `name:` silently
  breaks the pair, because `pr-comment.yml` matches on that string.
