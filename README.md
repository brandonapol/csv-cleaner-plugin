# Proofsheet

A ChatGPT plugin that flags bad dates, duplicate rows, and encoding damage in a CSV, then applies **only the fixes someone accepts**.

There was no plugin for this. The cleaner is stateless: send the same CSV and options to scan and to apply. Nothing is stored.

## What it flags

| Kind | Examples | Accepted fix |
| --- | --- | --- |
| Encoding | UTF-8 BOM, mixed newlines, UTF-8-as-Windows-1252 mojibake (`CafÃ©`) | Strip, normalize, or restore the characters |
| Encoding | U+FFFD, a row with the wrong number of columns | Flag only. The original byte is already gone. |
| Dates | `31/06/1912`, `2024-02-30` | Flag only |
| Dates | `03/04/1843` when both month/day orders are possible | ISO-8601, using the order you set or the order inferred from unambiguous siblings |
| Dates | `26/08/1918`, `March 4, 2024`, Excel serials on a date column | Safe rewrite to `YYYY-MM-DD` |
| Duplicates | Exact copies, or trim/case-insensitive copies | Drop that row. You choose keep-first or keep-last. Exact copies are safe. Normalized copies are not. |

Ambiguous dates are not marked safe unless you explicitly set `dateOrder` to `mdy` or `dmy`.

## Run

Node 22+.

```bash
npm test
npm start
```

The server listens on `PORT` (default `8787`) and fills its own origin into:

- `GET /.well-known/ai-plugin.json`
- `GET /openapi.yaml`
- `GET /logo.svg`
- `POST /v1/scan`
- `POST /v1/apply`
- `GET /health`

`examples/dirty.csv` plants one of each problem.

## Call it from a Custom GPT

1. Start the server on a public HTTPS URL.
2. In the GPT editor, add an Action and import `https://<your-host>/openapi.yaml`.
3. Authentication: none. The CSV is in the request body and is not stored.
4. Paste these instructions:

> You clean CSV files with the Proofsheet action. When the user provides a CSV, call `scanCsv` and show every finding: id, what is wrong, and the proposed fix. Do not call `applyFixes` until the user accepts specific finding ids, or explicitly asks to accept every safe fix. Pass `reject` for anything they want left alone. `reject` wins over `acceptSafe`. After `applyFixes`, report applied, skipped, and unknown ids, and return the cleaned CSV. Never invent a finding id, and never rewrite a finding with `fixable: false`.

The checked-in `openapi.yaml` and `ai-plugin.json` use `https://csv-cleaner.example.com` as a placeholder. The running server rewrites that to the request origin.

## Apply contract

```json
{
  "csv": "name,hired\nAda,26/08/1918\n",
  "accept": ["date:normalize:r2:c1"],
  "reject": [],
  "acceptSafe": false,
  "options": { "dateOrder": "auto", "duplicateMode": "exact", "duplicateKeep": "first" }
}
```

`acceptSafe: true` adds every finding with `safe: true` and `fixable: true`. Ids in `reject` are removed after that. Unknown ids come back in `unknown` and are not applied. If you accept nothing that changes the file, the original CSV text is returned unchanged.

## Issues

- #2 Plugin contract
- #3 Encoding
- #4 Dates
- #5 Duplicates
- #6 Apply and HTTP server
