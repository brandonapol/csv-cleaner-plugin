import { inferDateOrder, inspectDate, isDateHeader, isStrictDateShape, type DateOrder } from "./dates.ts";
import { parseCsv, serializeCsv, type ParsedCsv } from "./parse.ts";
import { repairMojibake } from "./repair.ts";
import type { ApplyRequest, ApplyResult, Finding, ScanOptions, ScanReport } from "./types.ts";

export { CleanerError } from "./parse.ts";
export type { ApplyRequest, ApplyResult, Finding, ScanOptions, ScanReport } from "./types.ts";

function columnLabel(headers: string[], index: number): string {
  const name = headers[index]?.trim();
  return name || `column ${index + 1}`;
}

function dateColumns(parsed: ParsedCsv): number[] {
  const chosen: number[] = [];
  for (let c = 0; c < parsed.headers.length; c++) {
    if (isDateHeader(parsed.headers[c] ?? "")) {
      chosen.push(c);
      continue;
    }
    let nonempty = 0;
    let shaped = 0;
    for (const row of parsed.rows) {
      const value = row[c]?.trim() ?? "";
      if (!value) continue;
      nonempty++;
      if (isStrictDateShape(value)) shaped++;
    }
    if (nonempty >= 3 && shaped / nonempty >= 0.6) chosen.push(c);
  }
  return chosen;
}

function orderLabel(order: DateOrder): string {
  if (order === "dmy") return "day/month/year";
  if (order === "ymd") return "year/month/day";
  return "month/day/year";
}

function pushDate(
  findings: Finding[],
  parsed: ParsedCsv,
  rowIndex: number,
  column: number,
  raw: string,
  order: DateOrder,
  explicit: boolean,
  inferred: DateOrder | null,
) {
  const header = isDateHeader(parsed.headers[column] ?? "");
  const shaped = isStrictDateShape(raw);
  if (!header && !shaped) return;

  const inspected = inspectDate(raw, order, header);
  if (inspected.kind === "skip" || inspected.kind === "iso") return;

  const row = rowIndex + 2;
  const columnName = columnLabel(parsed.headers, column);
  if (inspected.kind === "invalid") {
    findings.push({
      id: `date:invalid:r${row}:c${column}`,
      kind: "date",
      severity: "error",
      safe: false,
      fixable: false,
      title: `Bad date in ${columnName}`,
      detail: `Row ${row} cannot be repaired: ${inspected.reason}.`,
      row,
      column: columnName,
      before: raw,
    });
    return;
  }

  const base = {
    kind: "date" as const,
    row,
    column: columnName,
    before: raw,
    after: inspected.iso,
    fixable: true,
  };

  if (inspected.ambiguous) {
    let why = `Read as ${orderLabel(order)}`;
    if (explicit) why += " because that order was selected.";
    else if (inferred) why += " because other dates in this file only make sense that way.";
    else why += " by default. Nothing else in the file settled the order.";
    findings.push({
      ...base,
      id: `date:ambiguous:r${row}:c${column}`,
      severity: "warning",
      safe: explicit && order !== "ymd",
      title: `Ambiguous date in ${columnName}`,
      detail: `Row ${row} can be read two ways. ${why} Accept to write ${inspected.iso}.`,
    });
    return;
  }

  const via = inspected.via === "excel" ? "Excel serial" : "non-ISO date";
  findings.push({
    ...base,
    id: inspected.via === "excel" ? `date:excel:r${row}:c${column}` : `date:normalize:r${row}:c${column}`,
    severity: "warning",
    safe: true,
    title: inspected.via === "excel" ? `Excel serial in ${columnName}` : `Normalize date in ${columnName}`,
    detail: `Row ${row} is a ${via}. Accepting writes ${inspected.iso}.`,
  });
}

function duplicateFindings(parsed: ParsedCsv, options: ScanOptions): Finding[] {
  const mode = options.duplicateMode ?? "exact";
  const keep = options.duplicateKeep ?? "first";
  const groups = new Map<string, number[]>();

  parsed.rows.forEach((cells, index) => {
    const key = cells
      .map((cell) => (mode === "exact" ? cell : cell.trim().replace(/\s+/g, " ").toLowerCase()))
      .join("\u0001");
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  });

  const findings: Finding[] = [];
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const ordered = [...indexes].sort((a, b) => a - b);
    const keeper = keep === "last" ? ordered[ordered.length - 1] : ordered[0];
    for (const index of ordered) {
      if (index === keeper) continue;
      const row = index + 2;
      const keeperRow = keeper + 2;
      findings.push({
        id: `duplicate:${mode}:r${row}`,
        kind: "duplicate",
        severity: "warning",
        safe: mode === "exact",
        fixable: true,
        title: `Duplicate row ${row}`,
        detail:
          mode === "exact"
            ? `Identical to row ${keeperRow}. Accepting drops row ${row} and keeps row ${keeperRow}.`
            : `Matches row ${keeperRow} after trimming and ignoring case. Accepting drops row ${row}.`,
        row,
        relatedRows: ordered.map((n) => n + 2),
        before: parsed.rows[index].join(" | "),
        after: "",
      });
    }
  }
  return findings;
}

export function scanCsv(csv: string, options: ScanOptions = {}): ScanReport {
  const parsed = parseCsv(csv);
  const requested = options.dateOrder ?? "auto";
  const columns = dateColumns(parsed);
  const inferred = requested === "auto" ? inferDateOrder(parsed.rows, columns) : requested;
  const dateOrderUsed: DateOrder = inferred ?? "mdy";
  const explicit = requested !== "auto";
  const findings: Finding[] = [];

  if (parsed.bom) {
    findings.push({
      id: "encoding:bom",
      kind: "encoding",
      severity: "warning",
      safe: true,
      fixable: true,
      title: "UTF-8 BOM",
      detail: "A byte-order mark is sitting on the first header. Accepting strips it.",
      before: "BOM",
      after: "",
    });
  }

  if (parsed.newline === "mixed") {
    findings.push({
      id: "encoding:newlines",
      kind: "encoding",
      severity: "warning",
      safe: true,
      fixable: true,
      title: "Mixed newlines",
      detail: "The file mixes newline styles. Accepting normalizes them to line feeds.",
    });
  }

  if (options.sourceEncoding === "windows-1252" || options.sourceEncoding === "utf-16le") {
    const label = options.sourceEncoding === "windows-1252" ? "Windows-1252" : "UTF-16";
    findings.push({
      id: "encoding:source",
      kind: "encoding",
      severity: "warning",
      safe: true,
      fixable: true,
      title: `Decoded from ${label}`,
      detail: `The upload was not valid UTF-8, so it was decoded as ${label}. The export is UTF-8.`,
    });
  }

  for (const ragged of parsed.ragged) {
    findings.push({
      id: `encoding:ragged:r${ragged.row}`,
      kind: "encoding",
      severity: "error",
      safe: false,
      fixable: false,
      title: `Row ${ragged.row} has ${ragged.width} columns`,
      detail: `The header has ${parsed.headers.length}. This row was left as parsed and not reshaped.`,
      row: ragged.row,
    });
  }

  parsed.rows.forEach((cells, rowIndex) => {
    cells.forEach((value, column) => {
      const row = rowIndex + 2;
      const columnName = columnLabel(parsed.headers, column);
      if (value.includes("\uFFFD")) {
        findings.push({
          id: `encoding:replacement:r${row}:c${column}`,
          kind: "encoding",
          severity: "error",
          safe: false,
          fixable: false,
          title: `Replacement character in ${columnName}`,
          detail: `Row ${row} contains U+FFFD. The original byte is already gone, so this is flag-only.`,
          row,
          column: columnName,
          before: value,
        });
      }
      const repaired = repairMojibake(value);
      if (repaired) {
        findings.push({
          id: `encoding:mojibake:r${row}:c${column}`,
          kind: "encoding",
          severity: "warning",
          safe: true,
          fixable: true,
          title: `Mojibake in ${columnName}`,
          detail: `Row ${row} looks like UTF-8 read as Windows-1252. Accepting restores the characters.`,
          row,
          column: columnName,
          before: value,
          after: repaired,
        });
      }
    });
  });

  const seen = new Set(columns);
  parsed.rows.forEach((cells, rowIndex) => {
    cells.forEach((value, column) => {
      if (!value.trim()) return;
      if (!seen.has(column) && !isStrictDateShape(value)) return;
      pushDate(findings, parsed, rowIndex, column, value, dateOrderUsed, explicit, requested === "auto" ? inferred : dateOrderUsed);
    });
  });

  findings.push(...duplicateFindings(parsed, options));

  const summary = {
    encoding: findings.filter((f) => f.kind === "encoding").length,
    date: findings.filter((f) => f.kind === "date").length,
    duplicate: findings.filter((f) => f.kind === "duplicate").length,
    fixable: findings.filter((f) => f.fixable).length,
    safe: findings.filter((f) => f.safe && f.fixable).length,
  };

  return {
    delimiter: parsed.delimiter,
    newline: parsed.newline,
    rowCount: parsed.rows.length,
    columnCount: parsed.headers.length,
    headers: parsed.headers,
    inferredDateOrder: requested === "auto" ? inferred : null,
    dateOrderUsed,
    findings,
    summary,
  };
}

export function applyFixes(csv: string, request: ApplyRequest = { csv }): ApplyResult {
  const options = request.options ?? {};
  const report = scanCsv(csv, options);
  const byId = new Map(report.findings.map((finding) => [finding.id, finding]));
  const wanted = new Set(request.accept ?? []);
  if (request.acceptSafe) {
    for (const finding of report.findings) {
      if (finding.safe && finding.fixable) wanted.add(finding.id);
    }
  }
  for (const id of request.reject ?? []) wanted.delete(id);

  const unknown: string[] = [];
  const skipped: string[] = [];
  const applied: string[] = [];
  for (const id of wanted) {
    const finding = byId.get(id);
    if (!finding) {
      unknown.push(id);
      continue;
    }
    if (!finding.fixable) {
      skipped.push(id);
      continue;
    }
    applied.push(id);
  }

  const content = applied.some((id) => {
    const finding = byId.get(id)!;
    return finding.kind === "date" || finding.kind === "duplicate" || id.startsWith("encoding:mojibake");
  });
  const stripBom = applied.includes("encoding:bom");
  const fixNewlines = applied.includes("encoding:newlines");

  if (!content && !stripBom && !fixNewlines) {
    return { csv, applied, skipped, unknown, report };
  }
  if (!content) {
    let next = csv;
    if (stripBom) next = next.replace(/^\uFEFF/, "");
    if (fixNewlines) next = next.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return { csv: next, applied, skipped, unknown, report };
  }

  const parsed = parseCsv(csv);
  const drop = new Set<number>();
  const edits = new Map<string, string>();
  for (const id of applied) {
    const finding = byId.get(id)!;
    if (finding.kind === "duplicate" && finding.row) {
      drop.add(finding.row - 2);
      continue;
    }
    if (finding.after === undefined || !finding.row) continue;
    const column = Number(/:c(\d+)$/.exec(id)?.[1]);
    if (!Number.isInteger(column)) continue;
    const key = `${finding.row - 2}:${column}`;
    if (finding.kind === "date" || !edits.has(key)) edits.set(key, finding.after);
  }

  const rows = parsed.rows.flatMap((cells, index) => {
    if (drop.has(index)) return [];
    const next = cells.slice();
    for (let column = 0; column < next.length; column++) {
      const value = edits.get(`${index}:${column}`);
      if (value !== undefined) next[column] = value;
    }
    return [next];
  });

  const newline =
    parsed.newline === "crlf" && !fixNewlines ? "\r\n" : parsed.newline === "cr" && !fixNewlines ? "\r" : "\n";
  const out = serializeCsv(parsed.headers, rows, parsed.delimiter, newline, parsed.bom && !stripBom);
  return { csv: out, applied, skipped, unknown, report };
}
