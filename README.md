# Proofsheet

ChatGPT plugin that flags bad dates, duplicate rows, and encoding problems in a CSV, then applies only the fixes a person accepts.

## Contract

Behavior is not in this change. This is the shape ChatGPT will call.

- `/.well-known/ai-plugin.json` declares a no-auth plugin. The model must show findings and must not apply a fix the user did not accept.
- `openapi.yaml` documents `POST /v1/scan` (`scanCsv`) and `POST /v1/apply` (`applyFixes`).
- Finding ids are stable for the same CSV and options, so scan and apply agree without a session.
- `reject` wins over `accept` and `acceptSafe`.
- Findings with `fixable: false` are flags only.

The checked-in server URL is the placeholder `https://csv-cleaner.example.com`. A running server rewrites the manifest and schema to the request origin.
