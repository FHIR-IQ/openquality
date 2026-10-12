# Shared library packages: implementation plan

Spec: `docs/superpowers/specs/2026-10-12-shared-library-packages-design.md`.
Baseline: `tools/test/fixtures/library-sets-2026-10-12.json`, the Library set of every
package's bundle before the change (id, url, version, name, CQL hash, depends-on).

Each task is test-first and leaves `pnpm typecheck && pnpm test` green.

1. **Library identity (core).** `library: {name, version}` in the schema (permissive).
   New `library.ts` owning `manifest.library`. `manifest.measure` passes with `library`.
   CheckId, `validate.ts`, `LEVEL_1_CHECKS`, `L1_CHECKS` fixture.
2. **Dependency resolution (core).** `corpus.ts`: read every package under given roots
   into an `id@version` index. `resolveDependencies(manifest, lookup)`: transitive,
   deduplicated, sorted, cycle-safe, reports missing.
3. **Emitters (core).** `buildPackageBundle` and `buildFhirPackage` take resolved
   dependencies. Dependency Libraries are built against their own manifest and listed
   as `depends-on` on the asset-collection; own artifacts stay `composed-of`.
4. **CLI.** `validate-all` reports unresolved dependencies (`dependencies.resolve`) and
   fails. `fhir-bundle` / `fhir-package` resolve from `measures/` (`--corpus` override).
5. **Importer.** Emit `cms/lib-<name>` packages; measures declare direct `dependencies`
   and stop vendoring. Golden fixture and plan tests updated. Re-run the import.
6. **Invariant.** `tools/test/library-sets.test.ts`: for every package in the baseline,
   the Library set of its dependency-resolved bundle equals the baseline.
7. **Catalogue and site.** `index.json` gains `kind` and `dependencies`. Library page
   lists shared libraries in their own section.
8. **MCP.** `get_bundle` resolves dependencies through the catalogue; `get_measure`
   shows them; `search_measures` takes `kind`, default `measure`. Release 0.2.0 by tag.
9. **Docs.** spec, measures README, CLAUDE.md, corpus-2026-002 resolved, connectathon
   Scenario 2, learning example, public counts.
10. **Ship.** PR, CI including drift, merge, production check with
    `packages/mcp/scripts/verify-deployment.ts`.
