# Governance

Open Quality is community infrastructure. This document says plainly who runs it today,
how decisions get made, and how that changes as the community grows. It is meant to answer
the fair question — "is this a vendor project?" — before anyone has to ask it.

## Present state: founder-stewarded

Open Quality was founded and is currently stewarded by **FHIR IQ** (Gene Vestel). At this
stage a single steward is honest about the size of the project: one maintainer reviews
contributions, runs the licensing and takedown process, and makes final calls.

This is a starting condition, not the intended end state.

## Commitment to broaden

The steward commits, in writing here, to move Open Quality toward shared community
governance as it earns the contributors to support it. Concretely:

- **Maintainers beyond the founder.** Contributors who do sustained, high-quality work —
  publishing and reviewing measures, curating the knowledge corpus, improving the tooling —
  will be invited to become maintainers with commit and review rights. The bar is
  demonstrated contribution and judgment, not affiliation.
- **A steering group.** Once there are maintainers from more than one organization, a
  steering group takes over roadmap and policy decisions from the founder, and this
  document is revised to describe it.
- **A path to a neutral home.** Open Quality is intended to eventually sit under neutral
  governance — a foundation, an HL7 work group, or an accelerator — if and when the
  community wants that. No single company, including FHIR IQ, is meant to own it long term.

The founder's role is to start the thing and then get out of its way. Progress against
this commitment is a fair thing to hold the project to.

## How decisions are made

- **Routine contributions** (a measure package, a knowledge-corpus entry, a doc fix,
  a bug fix) are decided by maintainer review on the pull request, against the published
  criteria in [CONTRIBUTING](CONTRIBUTING.md) and [`spec/`](spec/).
- **Policy and format changes** (the package format, the conformance levels, the content
  policy, the CRMI mapping) are proposed as an issue, discussed in the open, and decided by
  the steward today or the steering group once it exists. Substantive changes are announced
  before they land.
- **Disagreement** is resolved by discussion first. Where alignment with HL7 CRMI, the
  Quality Measure IG, or CQL is in question, we defer to those specifications and their work
  groups rather than inventing a local answer.

## Roles

| Role | Who | What they do |
|------|-----|--------------|
| Steward | FHIR IQ (founder) | Final decisions, licensing and takedown, project direction — until the steering group exists |
| Maintainer | Invited contributors | Review and merge contributions, curate content and the corpus |
| Contributor | Anyone | Publish measures, file interpretation issues and test cases, review, improve tooling |

Participation requires only a GitHub account and agreement to the
[Code of Conduct](CODE_OF_CONDUCT.md). You do not need to publish code to take part —
filing an interpretation issue or a test case is a first-class contribution.

## Relationship to the standards community

Open Quality is a consumer and supporter of the standards, not a competing authority.

- It aligns its packaging with **HL7 CRMI** and its measure representation with the
  **Quality Measure IG (cqfmeasures)** and **CQL**, and tracks those specifications rather
  than diverging from them.
- It reuses **cqframework** tooling and shared libraries.
- It is **not a measure steward** and is not affiliated with or endorsed by CMS, NCQA, or
  HL7. Seeded content is redistributed from public sources with provenance on each package.

## Licensing and intellectual property

- All project code is **MIT** licensed. See [LICENSE](LICENSE).
- Published content must carry an approved open license, and value sets are referenced,
  never embedded. The rules are in [CONTRIBUTING](CONTRIBUTING.md) and the content policy in
  the [README](README.md).
- A documented **takedown process** backs the content policy, because the automated scanner
  is a first filter and not a guarantee. Report a concern to **conduct@fhiriq.com**.

## Changing this document

This document changes as the project's governance changes. Amendments are proposed as a
pull request and are subject to the same open discussion as any policy change. When the
steering group forms, its first task is to ratify or revise what is written here.
