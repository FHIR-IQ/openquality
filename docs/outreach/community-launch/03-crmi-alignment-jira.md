# DRAFT — CRMI alignment feedback (JIRA + WG, not GitHub)

**Not sent.**

**Correction to the earlier plan: there is no GitHub issue to open.** Issues are disabled
on https://github.com/HL7/crmi-ig (`has_issues: false`; the repo description is just a
pointer to the project scope statement, https://jira.hl7.org/browse/PSS-1959). CRMI is a
live HL7 work group product, so feedback goes through HL7's channels, not GitHub.

The IG's own **Support** menu names the four channels (verified from the current build at
https://build.fhir.org/ig/HL7/crmi-ig/):

| Channel | URL | Use for |
| --- | --- | --- |
| Discussion Forum | https://chat.fhir.org/#narrow/channel/179220-cql | Open-ended questions, "is my reading right" |
| Propose a Change (JIRA) | https://jira.hl7.org/secure/CreateIssueDetails!init.jspa?pid=10405&issuetype=10600&customfield_11302=FHIR-crmi | One specific, actionable change or clarification per ticket |
| Specification Dashboard | https://jira.hl7.org/secure/Dashboard.jspa?selectPageId=17138 | Read first — check the question isn't already tracked |
| Project Page | https://confluence.hl7.org/spaces/CDS/pages/108303939/CRMI+-+Canonical+Resource+Management+Infrastructure+IG | Call schedule, minutes, how to join |

Publisher: **HL7 International / Clinical Decision Support (CDS)** WG, co-sponsored with
Clinical Quality Information (CQI). Current published version is v2.0.0 (STU 2); the CI
build is 2.1.0.

Two things follow from this:

1. **The Discussion Forum for CRMI is `#cql` — the same stream as draft 01.** Don't post
   a second, separate introduction there. Draft 01 already asks "does the CRMI mapping
   look right." Post 01 first and let the mapping question ride on it.
2. **JIRA is for change requests, not for reviews.** A ticket that says "please look at my
   project" will be dispositioned as Not Persuasive and burn credibility. A ticket that
   says "this sentence on the Packaging page is ambiguous, here is proposed wording" gets
   discussed on a WG call. Only file after 01 surfaces a genuine ambiguity.

## Sequence

1. Post draft 01 to `#cql`. Wait for replies on the mapping question.
2. Search the Specification Dashboard for anything already filed on the same point.
3. For each ambiguity that survives both, file **one** JIRA ticket using the template
   below. Log the ticket key in this file when filed.
4. Join a CDS WG call (project page above) or the Clinical Reasoning connectathon track
   for the "where does an open corpus plug in" question. That is a roadmap conversation,
   not a spec defect, so it does not belong in JIRA at all.

## Filing a ticket

Use the **Propose a Change** link from the *bottom of the specific IG page* the comment is
about, not the generic link — it pre-fills the specification (`FHIR-crmi`), version, and
page URL. A free HL7 JIRA account is required. Tickets are public.

Ticket structure HL7 expects:

- **Summary:** the change, in one line.
- **Existing Wording:** quote verbatim from the page.
- **Proposed Wording:** the exact replacement text. Not "please clarify" — write the
  clarification you want.
- **Comment:** why, with the concrete use case that hit the ambiguity.

## Candidate ticket 1 — manifest Library for non-FHIR artifact content

Page: https://hl7.org/fhir/uv/crmi/STU2/artifact-manifest.html (confirm exact anchor
before filing)

- **Summary:** Clarify whether a CRMIManifestLibrary may declare dependencies on artifacts
  that are not published as FHIR resources
- **Comment:** We package quality measures whose logic ships as CQL and as SQL /
  SQL-on-FHIR ViewDefinitions. The FHIR-canonical artifacts map cleanly onto
  `relatedArtifact` `depends-on` / `composed-of`, but it is not clear from the current
  wording whether a `composed-of` entry may reference an artifact carried as an attachment
  rather than as a resolvable canonical, or whether such content is out of scope for a
  manifest. Both readings are defensible today, and they produce incompatible bundles.

Fill in Existing/Proposed Wording once the exact paragraph is picked. Do not file with the
wording blank.

## Candidate ticket 2 — version pinning for third-party artifact repositories

Page: https://hl7.org/fhir/uv/crmi/STU2/packaging.html

- **Summary:** Add guidance on released-content immutability for repositories that
  republish artifacts they do not own
- **Comment:** An open corpus that packages measures authored elsewhere has to pin the
  upstream version and guarantee its own releases are immutable, while upstream may
  retire or revise. CR 3.3 covers the owner's obligations; guidance on the republisher's
  obligations (what `version`, what `status`, whether the relationship is expressed with
  `derived-from` or `composed-of`) would prevent divergent conventions across public
  repositories.

## What not to send

The previous draft of this file was a project introduction addressed to "CRMI
maintainers." That text is now redundant with draft 01 and has no valid destination —
don't paste it into JIRA. If a shorter version is ever needed on a WG call, it is two
sentences: what Open Quality is, and that the CRMI mapping is written up at
https://github.com/FHIR-IQ/openquality/blob/main/spec/README.md.
