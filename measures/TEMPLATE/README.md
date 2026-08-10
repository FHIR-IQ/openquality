# Template Measure

A package skeleton that reaches Level 1 as it stands. Copy it, rename it, and
replace the contents:

```bash
cp -r measures/TEMPLATE measures/community/my-measure
pnpm oq validate measures/community/my-measure
```

The validator prints every finding at once and says what is blocking the next
level. Change one field at a time and re-run it.

This directory is not part of a collection, so it is not counted in the corpus
and it does not appear in the [library](https://openquality.us/library). It
exists to be copied.

## What Level 1 requires

Level 1 is called **Described**: the package says what it is in a form a machine
can read, and carries nothing it has no right to redistribute. Ten checks gate
it, and only errors count. A warning never blocks a level.

| Check | What it wants |
|---|---|
| `manifest.schema` | `openquality.yaml` parses and matches the schema |
| `manifest.license` | An SPDX identifier on the allowlist |
| `manifest.dataModel` | A declared data model |
| `manifest.measure` | A `measure.title` |
| `manifest.provenance` | If a provenance block is present, it is complete |
| `artifacts.present` | At least one artifact, and every declared path exists |
| `artifacts.typed` | Every artifact declares a known type |
| `valuesets.referenced` | Value sets referenced by OID or canonical URL |
| `readme.sections` | This README has Intent, Known Limitations, and Provenance |
| `package.symlinks` | Real files only, so nothing can hide from the scanner |

Level 2 is **Verified**, and nothing reaches it today. It needs CQL translation,
FHIR profile validation, and SQL parsing, none of which are implemented. Level 1
is the ceiling for every package in this repository, including the seeded ones.

The three sections below are required. The validator only checks that the
headings exist; what goes under them is the part a future reader needs most, and
no tool can check it for you.

## Intent

What the measure counts, in a sentence or two a clinician would recognize:
the population, the numerator, and what a higher score means.

This template counts nothing. `TemplateMeasure.cql` is a syntactically valid
skeleton whose numerator is a literal `false`.

## Known Limitations

Where the logic is approximate, what it cannot see in the data, which
populations it handles badly, and anything you would tell someone in person
before they ran it. This is the section that saves the next implementer a week.

Write "none recorded yet" rather than inventing an entry. Leaving the gap
visible is how someone knows to fill it. If you hit a limitation in a package
you did not write, file it in [`knowledge/`](../../knowledge/) instead: that
needs a GitHub account and nothing else.

## Provenance

Where the content came from. For original logic, say so and name the
specification you wrote it against. For redistributed content, name the source,
the exact commit or release, the date retrieved, and whether you changed
anything. If you changed something, say what.

The `provenance` block in `openquality.yaml` is the machine-readable half of
this. Omit it entirely for original work rather than filling it with
placeholders: a provenance claim nobody can check is worse than none.

This template is original scaffolding written for this repository under
Apache-2.0. It has no upstream, which is why the manifest declares no provenance
block.

## Before you open the pull request

1. `pnpm oq validate measures/<collection>/<your-package>` reports Level 1.
2. Every value set the logic uses is listed in the manifest by OID or canonical
   URL, and no expansion is pasted into the package.
3. No licensed display text. A code and its code system may be referenced;
   descriptors that carry a licence may not. The rules per code system are in
   [TERMINOLOGY](../../TERMINOLOGY.md), and the validator enforces them.
4. You have the right to publish what you are submitting under the licence you
   declared.

The rest is in [CONTRIBUTING](../../CONTRIBUTING.md#1-publish-a-measure-package).
If you are not sure which collection your package belongs in, open an issue
first. That question is cheaper to answer before you do the work.
