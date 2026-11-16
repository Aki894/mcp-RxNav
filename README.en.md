# RxNav MCP Server

Search drug concepts, retrieve generic and brand relations, look up ATC classifications and ingredients, and fetch complete RxNorm concept data from an AI assistant.

[简体中文](README.md) · [API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html) · [GitHub Issues](https://github.com/Aki894/mcp-RxNav/issues)

## Features

- **`search_drug_by_name`**: Search drug products associated with an ingredient, generic, or brand name. Returns RxCUIs, names, term types, and source links with a global result limit.
- **`get_generic_name`**: Get related ingredient and generic clinical concepts for a drug name or RxCUI. Preserves every exact/normalized name candidate instead of selecting the first.
- **`get_brand_names`**: Get related brand names, branded products, and branded packs for a generic name, grouped by resolved RxCUI.
- **`get_atc_classification`**: Get ATC properties and RxClass ATC memberships for all resolved drug candidates. Preserves classification source, class names, levels, and links.
- **`get_drug_ingredients`**: Get ingredient concepts, source concept properties, and strength/dose-form attributes when supplied upstream. Keeps multiple name candidates separate.
- **`get_complete_drug_details`**: Get complete concept properties, generic/brand relations, ATC classifications, and ingredients by RxCUI, or select sections. Upstream section failures are reported as errors rather than silently omitted.
- **`resolve_drug`**: Resolve names using exact-or-normalized matching to RxCUIs. Preserves all matches without fetching properties or automatically resolving ambiguity.

## Quick start

Requires Git, Node.js 22 or later, npm, and access to `rxnav.nlm.nih.gov`.

```bash
git clone https://github.com/Aki894/mcp-RxNav.git
cd mcp-RxNav
npm ci
npm run build
```

### Configure your MCP client

Add this entry to a client supporting the `mcpServers` format, replacing the entry point with its **absolute path**:

```json
{
  "mcpServers": {
    "rxnav": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-RxNav/dist/index.js"
      ]
    }
  }
}
```

On Windows, use `D:/mcp/mcp-RxNav/dist/index.js` to avoid JSON backslash escaping. If the client cannot find `node`, use the absolute path of the Node.js executable. Reload the MCP connection and inspect its tool list. For other client formats, enter the same command and arguments in their MCP settings.

The server uses **stdio** and is launched by the MCP client. No port or HTTP address is needed. Waiting for standard input when launched directly is expected.

No API key or required environment variables.

## Available tools

The server exposes **7 tools**. Validation rejects undeclared fields. Strings are trimmed and reject control characters. Pass numbers as JSON numbers and booleans as JSON booleans. Defaults, required fields, and bounds below match the server's published schemas.

### `search_drug_by_name`

Search drug products associated with an ingredient, generic, or brand name. Returns RxCUIs, names, term types, and source links with a global result limit.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `drug_name` | string | Yes | `—` | English ingredient, generic, or brand name length: 1–200 characters |
| `limit` | integer | No | `10` | Maximum concepts across all term-type groups, 1–50 ≥1; ≤50 |

Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "search_drug_by_name",
  "arguments": {
    "drug_name": "atorvastatin",
    "limit": 5
  }
}
```

### `get_generic_name`

Get related ingredient and generic clinical concepts for a drug name or RxCUI. Preserves every exact/normalized name candidate instead of selecting the first.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `drug_identifier` | string | Yes | `—` | Drug name or numeric RxCUI; all exact/normalized candidate IDs are preserved length: 1–200 characters |

Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "get_generic_name",
  "arguments": {
    "drug_identifier": "Lipitor"
  }
}
```

### `get_brand_names`

Get related brand names, branded products, and branded packs for a generic name, grouped by resolved RxCUI.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `generic_name` | string | Yes | `—` | English generic drug or ingredient name length: 1–200 characters |

Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "get_brand_names",
  "arguments": {
    "generic_name": "atorvastatin"
  }
}
```

### `get_atc_classification`

Get ATC properties and RxClass ATC memberships for all resolved drug candidates. Preserves classification source, class names, levels, and links.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `drug_identifier` | string | Yes | `—` | Drug name or numeric RxCUI; all exact/normalized candidate IDs are preserved length: 1–200 characters |

Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "get_atc_classification",
  "arguments": {
    "drug_identifier": "83367"
  }
}
```

### `get_drug_ingredients`

Get ingredient concepts, source concept properties, and strength/dose-form attributes when supplied upstream. Keeps multiple name candidates separate.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `drug_identifier` | string | Yes | `—` | Drug name or numeric RxCUI; all exact/normalized candidate IDs are preserved length: 1–200 characters |

Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "get_drug_ingredients",
  "arguments": {
    "drug_identifier": "617314"
  }
}
```

### `get_complete_drug_details`

Get complete concept properties, generic/brand relations, ATC classifications, and ingredients by RxCUI, or select sections. Upstream section failures are reported as errors rather than silently omitted.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `rxcui` | string | Yes | `—` | Numeric RxNorm concept identifier |
| `fields` | string[] | No | `—` | Sections to return; omitted or empty returns all. Allowed values are listed below. |

Allowed `fields` values:

- `omitted or empty returns every section maxItems=6; basic_info`
- `generic_names`
- `brand_names`
- `atc_codes`
- `ingredients`
- `properties`


Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "get_complete_drug_details",
  "arguments": {
    "rxcui": "617314",
    "fields": [
      "basic_info",
      "ingredients",
      "properties"
    ]
  }
}
```

### `resolve_drug`

Resolve names using exact-or-normalized matching to RxCUIs. Preserves all matches without fetching properties or automatically resolving ambiguity.

| Parameter | Type | Required | Default | Description and bounds |
| --- | --- | --- | --- | --- |
| `drug` | string | Yes | `—` | English generic or brand name length: 1–200 characters |

Example invocation (parameters for MCP `tools/call`):

```json
{
  "name": "resolve_drug",
  "arguments": {
    "drug": "atorvastatin"
  }
}
```

## Returned data and query behavior

The MCP response contains one `content` item with `type: "text"`; its `text` is a JSON string. Every successful result includes `source` and `query_url` identifying its source and primary request. Composite tools preserve additional request URLs in the result.

| Tool | Data fields and behavior |
| --- | --- |
| `search_drug_by_name` | `query`, `total_found`, `returned_count`, `truncated`, and `results`. Results retain upstream concept fields such as `rxcui`, `name`, `tty`, and `synonym`, plus a properties API `url`. |
| `get_generic_name` | `matched_rxcuis` and `results[]`; each candidate includes `rxcui`, `generic_names`, and the relation request `query_url`. |
| `get_brand_names` | `matched_rxcuis` and `results[]`; each candidate includes `rxcui`, `brand_names`, and the relation request `query_url`. |
| `get_atc_classification` | `matched_rxcuis` and `results[]`; candidates include `rxcui`, `atc_codes`, and `query_urls`. Entries retain `code`, nullable `name`, `level`, `source`, and `relation`; RxClass entries also retain `class_type` and `linked_concept`. |
| `get_drug_ingredients` | `matched_rxcuis` and `results[]`; candidates include `ingredients`, `basic_info`, complete `properties`, and `query_urls`. Strength and dose form come from upstream names and properties, without fabricated per-ingredient doses. |
| `get_complete_drug_details` | `rxcui`, `complete_drug_details`, and `query_urls`. Details contain selected sections, or `null` when no valid concept properties exist. Omitted or empty fields returns all six sections. |
| `resolve_drug` | `records[].id/url/content/metadata`; string RxCUI `id`, `content` formatted as “input name: RxCUI identifier”, and metadata containing `rxcui`, `queried_name`, and `match_mode`. |

The source marker is `rxnav`. Unmatched names produce empty candidate or record arrays. Generic-name, ATC, and ingredient tools accept names or numeric IDs. Numeric IDs are queried directly; unavailable relations produce empty arrays. Complete details first check concept properties, then retrieve selected sections. A failed upstream section request is an error rather than a silently incomplete success.

### Matching and relation scope

- Product search uses `/drugs.json` for concepts associated with a name. `limit` applies globally after deduplication; `total_found` counts unique concepts returned upstream, and `truncated` indicates local result limiting.
- Other name-based lookups use `/rxcui.json?search=2`: exact matching first, then normalized matching. All candidates are queried separately instead of selecting the first as the unique answer. The `resolve_drug` field `match_mode=exact_or_normalized` identifies this strategy.
- Generic concepts include IN, PIN, MIN, SCD, SCDF, and SCDG; brand concepts include BN, SBD, and BPCK; ingredients include IN, PIN, and MIN. Source names and term types remain distinct.
- ATC combines concept ATC properties with RxClass ATC memberships. Valid code lengths 1/3/4/5/7 map to levels 1–5. Memberships can refer to related ingredients or combination concepts; inspect `linked_concept` for scope. Missing classifications return empty arrays; absent ancestors are not fabricated from code strings.
- The server spaces upstream requests by at least 60 milliseconds. Coordinate total request rates with other processes sharing the IP. Follow source links to inspect concept details.

## Usage examples

After connecting, ask your assistant:

> Search atorvastatin products, select the RxCUI matching the intended strength and dose form, then retrieve its complete details, ingredients, and ATC classifications with source links.

Use the returned data for retrieval and research. Clinical interpretation requires product, study-design, and patient context; this project does not provide individual medical advice.

## Data source

Each call uses NLM’s [RxNorm API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html); ATC lookup also uses the [RxClass API](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxClass.getClassByRxNormDrugId.html). No local terminology database or result cache is maintained. Follow the [RxNav terms](https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html). This project uses public NLM data; NLM assumes no responsibility for the project and provides no endorsement or recommendation.

## Errors and troubleshooting

Tool failures set `isError: true`, with text JSON in this format:

```json
{"error":{"code":"invalid_arguments","message":"…","retryable":false}}
```

Each upstream request has a 30-second timeout and no automatic retries. Composite tools may make multiple requests. `retryable` indicates whether retrying later is appropriate.

| Symptom / code | Action |
| --- | --- |
| Missing tools or closed connection | Check Node.js ≥22, build the project, verify the absolute entry point, and reload the client. |
| `invalid_arguments` | Check required fields, types, bounds, enums, and extra parameters. |
| `unknown_tool` | Reload the tool list and use a name listed above. |
| `network / timeout` | Check access to rxnav.nlm.nih.gov and retry later. |
| `http_429 / http_5xx` | Reduce request frequency and retry after recovery. |
| `http_400 / http_401 / http_403` | Check query syntax, credentials, and upstream access requirements. |
| `http_404` | Check the identifier; unmatched searches follow each tool’s empty-result behavior. |
| `invalid_json / invalid_response` | Unexpected upstream data; report persistent failures with the code. |
| `cancelled` | The client cancelled the request; invoke again if needed. |
| `internal / configuration` | Check the installation and local modifications; report runtime details and the error. |

## Run from source

```bash
npm run build
npm start
npm run dev
```

These commands build the project, run the build, and run TypeScript source directly.

## Support and license

Report problems through [GitHub Issues](https://github.com/Aki894/mcp-RxNav/issues), including the Node.js version, MCP client, tool arguments, and error code. Remove credentials and personal information.

Code is licensed under [GPL-3.0](LICENSE). Source data terms apply separately.
