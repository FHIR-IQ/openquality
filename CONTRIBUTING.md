# Contributing to Open Quality

Community is the point of this project. There are three ways to contribute, and only one of
them involves publishing measure code. The other two are often the ones an employer will
approve even when they will not approve releasing the logic itself.

1. [Publish a measure package](#1-publish-a-measure-package)
2. [File an interpretation issue or a test case](#2-file-an-interpretation-issue-or-a-test-case)
3. [Review](#3-review)

By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md), and you confirm
that you have the right to publish what you submit under an approved open license. See the
content policy in the [README](README.md#content-policy) and the governance model in
[GOVERNANCE](GOVERNANCE.md).

---

## 1. Publish a measure package

A package is a directory with an `openquality.yaml` manifest and the artifacts it declares.
The full format, the conformance levels, and the CRMI mapping are in [`spec/`](spec/).

**Steps**

1. Copy [`measures/TEMPLATE/`](measures/TEMPLATE/) into the collection that matches your
   data model and measurement year. Open an issue first if you are not sure where it goes.

   ```bash
   cp -r measures/TEMPLATE measures/community/my-measure
   ```

   The template is a working package that reaches Level 1 as it stands, with every manifest
   field annotated. CI validates it on every pull request, so it cannot drift from the rules
   the validator actually enforces. Starting from scratch is fine too; the template just
   saves you a round trip.
2. Edit the `openquality.yaml` manifest. Reference value sets by OID or canonical URL —
   never paste an expansion into the package.
3. Write the package `README`, stating **intent**, **known limitations**, and
   **provenance**. This is required for Level 1 and it is the part a future reader needs
   most.
4. Validate locally before you open the pull request:

   ```bash
   pnpm oq validate measures/<collection>/<your-package>
   ```

5. Open the pull request. Local validation reaches Level 1, and today that is also the
   ceiling: deep validation (CQL to ELM, FHIR profile checks, SQL parsing, value-set
   resolution) will run on publish once the validator subsystem exists, and will then
   determine the final conformance level.

**What gets accepted**

- Open-licensed, publicly redistributable content only.
- No HEDIS logic, no redistributed VSAC expansions. No CPT display descriptors, which are
  AMA licensed; a CPT code and code system may be referenced. Full rules per code system are
  in [TERMINOLOGY](TERMINOLOGY.md). You may publish your own implementation written against
  a public specification.
- A published version is immutable. To change a package, publish a new version. Deprecate or
  withdraw an old version with a stated reason; nothing is deleted, because a measure cited
  in an audit has to stay resolvable.

## 2. File an interpretation issue or a test case

This is the highest-value, lowest-friction contribution, and it does not require you to
release any measure code.

The [`knowledge/`](knowledge/) corpus holds typed feedback attached to a measure and pinned
to a version. Each entry is one of:

- **Question** — something ambiguous about how the measure should behave.
- **Interpretation issue** — a place where the specification can be read two ways.
- **Defect report** — a concrete error in a published package.
- **Implementation note** — a lesson learned that would save the next implementer time.
- **Test case** — an input and the expected result.

You do not need git for this. [Open an issue](https://github.com/FHIR-IQ/openquality/issues/new/choose)
and pick the form that matches; the forms ask for the same fields as the entry format, and a
maintainer turns the thread into a committed entry. If you would rather open a pull request
directly, follow the entry format in [`knowledge/README.md`](knowledge/README.md).

An entry does not have to be about one measure. How CQL caches, how a ViewDefinition
flattens, how this repository versions things: those carry a `scope` instead of a `measure`,
and they are usually the more reusable answer. Filing them under whichever measure happened
to expose them buries them.

The schema is a machine-readable superset of the categories in the
[ONC eCQM Issue Tracker](https://oncprojectracking.healthit.gov/support/projects/CQM/summary),
so if you already file there, the mapping is direct.

## 3. Review

Read what others have published and say what you find. A review comment on a measure, a
confirmation that a test case reproduces, or a second opinion on an interpretation issue all
strengthen the corpus. Reviewing is how contributors earn maintainer status — see
[GOVERNANCE](GOVERNANCE.md).

---

## Working in the repository

```bash
pnpm install
pnpm test
pnpm oq validate <package-dir>
```

- Match the surrounding style; the tooling is TypeScript with Vitest.
- Keep pull requests focused. One measure, one fix, or one corpus entry per pull request is
  easiest to review.

- Discussion mostly happens on GitHub issues and on the FHIR Zulip
  [`#cql`](https://chat.fhir.org/#narrow/stream/179220-cql) stream, where the measure and
  clinical-reasoning community gathers.

### Generated files

Two directories are generated and must never be hand-edited:

| Directory | Generated by | If your pull request changes it |
|-------------------------|----------------------------|------------------------------------------------|
| `measures/cms-fhir-2026/` | `pnpm oq-import 2026-08-01` | CI fails. Change the importer, not the output. |
| `site/` | `pnpm build-library` | Nothing for you to do. A maintainer regenerates at merge. |

Adding a package or a knowledge entry changes the generated library, index and sitemap as a
consequence, because they state counts and link to every entry. You are not expected to run
the generator for that: CI reports which files need regenerating and a maintainer pushes them
to your branch before merging. **Contributing content needs nothing installed**, which is the
whole point of the [browser-only path](#2-file-an-interpretation-issue-or-a-test-case).

## Questions

Open a GitHub issue, or find us on FHIR Zulip `#cql`. If you are introducing a larger body
of work — a measure collection, a new data model, a tooling contribution — open an issue to
discuss it before you do the work, so we can point it in the right direction.
