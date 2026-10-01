export function pluginManifest(origin: string) {
  const root = origin.replace(/\/$/, "");
  return {
    schema_version: "v1",
    name_for_human: "Proofsheet",
    name_for_model: "proofsheet",
    description_for_human:
      "Flag bad dates, duplicate rows, and encoding problems in a CSV, then apply only the fixes you accept.",
    description_for_model:
      "Scan CSV text for encoding damage, invalid or ambiguous dates, and duplicate rows. Show the findings to the user, including id, kind, before, and after. Call applyFixes only with finding ids the user explicitly accepts. You may pass acceptSafe=true only when the user asks to accept every safe fix, and pass reject for anything they exclude. Never invent finding ids. Never claim a fix was applied unless it is in the applied list. Findings with fixable=false are flags only.",
    auth: { type: "none" },
    api: { type: "openapi", url: `${root}/openapi.yaml`, is_user_authenticated: false },
    logo_url: `${root}/logo.svg`,
    contact_email: "72466214+brandonapol@users.noreply.github.com",
    legal_info_url: "https://github.com/brandonapol/csv-cleaner-plugin",
  };
}

export function openApiDocument(origin: string): string {
  const root = origin.replace(/\/$/, "");
  return `openapi: 3.1.0
info:
  title: Proofsheet CSV Cleaner
  version: 1.0.0
  description: |
    Flags bad dates, duplicate rows, and encoding problems in CSV text.
    Apply a fix only when its finding id is accepted. The service is stateless:
    send the same CSV and options to scan and apply.
servers:
  - url: ${root}
paths:
  /v1/scan:
    post:
      operationId: scanCsv
      summary: Scan a CSV for encoding, date, and duplicate findings
      description: |
        Returns stable finding ids for this CSV and these options.
        Show the findings to the user before applying anything.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ScanRequest"
      responses:
        "200":
          description: Scan report
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ScanReport"
        "400":
          description: The CSV could not be scanned
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
  /v1/apply:
    post:
      operationId: applyFixes
      summary: Apply accepted fixes and return cleaned CSV
      description: |
        Re-scans the CSV, then applies only the accepted fixable findings.
        reject wins over accept and over acceptSafe.
        Unknown ids are reported and ignored. Unaccepted rows and cells stay.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ApplyRequest"
      responses:
        "200":
          description: Cleaned CSV plus what was applied
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ApplyResult"
        "400":
          description: The CSV could not be cleaned
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
components:
  schemas:
    ScanOptions:
      type: object
      properties:
        dateOrder:
          type: string
          enum: [auto, mdy, dmy, ymd]
          description: How to read ambiguous numeric dates. auto infers from unambiguous siblings.
        duplicateMode:
          type: string
          enum: [exact, normalized]
          description: exact compares raw cells. normalized trims, collapses whitespace, and ignores case.
        duplicateKeep:
          type: string
          enum: [first, last]
          description: Which copy to keep when a duplicate finding is accepted.
        sourceEncoding:
          type: string
          enum: [utf-8, windows-1252, utf-16le]
          description: Set when the file was decoded from something other than UTF-8 before this call.
    ScanRequest:
      type: object
      required: [csv]
      properties:
        csv:
          type: string
          description: Raw CSV text, including the header row. Maximum 750,000 characters.
        options:
          $ref: "#/components/schemas/ScanOptions"
    ApplyRequest:
      type: object
      required: [csv]
      properties:
        csv:
          type: string
        accept:
          type: array
          items:
            type: string
          description: Finding ids to apply.
        reject:
          type: array
          items:
            type: string
          description: Finding ids to leave alone. Wins over accept and acceptSafe.
        acceptSafe:
          type: boolean
          description: Also accept every finding marked safe and fixable.
        options:
          $ref: "#/components/schemas/ScanOptions"
    Finding:
      type: object
      required: [id, kind, severity, safe, fixable, title, detail]
      properties:
        id:
          type: string
        kind:
          type: string
          enum: [encoding, date, duplicate]
        severity:
          type: string
          enum: [error, warning]
        safe:
          type: boolean
        fixable:
          type: boolean
        title:
          type: string
        detail:
          type: string
        row:
          type: integer
          description: 1-based file row. Row 1 is the header.
        column:
          type: string
        relatedRows:
          type: array
          items:
            type: integer
        before:
          type: string
        after:
          type: string
          description: Empty string means the row is dropped.
    ScanReport:
      type: object
      properties:
        delimiter:
          type: string
        newline:
          type: string
          enum: [lf, crlf, cr, mixed]
        rowCount:
          type: integer
        columnCount:
          type: integer
        headers:
          type: array
          items:
            type: string
        inferredDateOrder:
          type: [string, "null"]
          enum: [mdy, dmy, ymd, null]
        dateOrderUsed:
          type: string
          enum: [mdy, dmy, ymd]
        findings:
          type: array
          items:
            $ref: "#/components/schemas/Finding"
        summary:
          type: object
          properties:
            encoding:
              type: integer
            date:
              type: integer
            duplicate:
              type: integer
            fixable:
              type: integer
            safe:
              type: integer
    ApplyResult:
      type: object
      properties:
        csv:
          type: string
          description: Cleaned CSV. Identical to the input when nothing content-bearing was applied.
        applied:
          type: array
          items:
            type: string
        skipped:
          type: array
          items:
            type: string
          description: Accepted ids that are flags only and were not applied.
        unknown:
          type: array
          items:
            type: string
        report:
          $ref: "#/components/schemas/ScanReport"
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: string
`;
}
