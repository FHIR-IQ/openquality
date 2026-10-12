# @openquality/mcp

A read-only [MCP](https://modelcontextprotocol.io) server for the
[Open Quality](https://openquality.us) corpus of healthcare quality measures. It
gives a coding agent a measure's CQL, SQL or FHIR artifacts together with their
provenance, license and known interpretation issues.

## Hosted, no install

```text
https://openquality.us/mcp
```

Streamable HTTP, no account or key. Client configs:
[openquality.us/mcp-setup](https://openquality.us/mcp-setup).

## Local, over stdio

```bash
npx @openquality/mcp                 # GitHub, main
npx @openquality/mcp --ref <sha>     # GitHub, a fixed commit
npx @openquality/mcp --root <clone>  # a local clone, no network
```

## Tools

| Tool | Returns |
|------|---------|
| `search_measures` | Packages matching a CMS id, title words, steward or package id |
| `get_measure` | License, provenance, value set references, file list, known issue summaries |
| `get_artifact` | The raw text of one file a package lists |
| `get_bundle` | The CRMI artifact Bundle, the shape `$package` returns |
| `known_issues` | Interpretation issues, defects and test cases, with their full text |

Every result ends with the commit it was served from, the package license, and the
content policy. Value sets are referenced, never embedded. CPT display text is
removed. Packages are repackaged copies, not authoritative publications.

Open Quality is not a measure steward and is not affiliated with or endorsed by CMS,
NCQA, or HL7. Tooling MIT; measure content keeps the license its package declares.
