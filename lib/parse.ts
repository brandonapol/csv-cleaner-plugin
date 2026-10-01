export const MAX_CHARS = 750_000;
export const MAX_ROWS = 20_000;

export class CleanerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanerError";
  }
}

export type NewlineStyle = "lf" | "crlf" | "cr" | "mixed";
export type Delimiter = "," | ";" | "\t";

export type ParsedCsv = {
  bom: boolean;
  newline: NewlineStyle;
  delimiter: Delimiter;
  headers: string[];
  rows: string[][];
  ragged: { row: number; width: number }[];
};

export function detectNewline(text: string): NewlineStyle {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = text.match(/(?<!\r)\n/g)?.length ?? 0;
  const cr = text.match(/\r(?!\n)/g)?.length ?? 0;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  if (kinds > 1) return "mixed";
  if (crlf > 0) return "crlf";
  if (cr > 0) return "cr";
  return "lf";
}

function firstRecordLine(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && (c === "\n" || c === "\r")) return text.slice(0, i);
  }
  return text;
}

function countDelim(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    } else if (!quoted && c === delimiter) count++;
  }
  return count;
}

export function detectDelimiter(text: string): Delimiter {
  const line = firstRecordLine(text);
  const comma = countDelim(line, ",");
  const semi = countDelim(line, ";");
  const tab = countDelim(line, "\t");
  if (tab > comma && tab >= semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

function parseRecords(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        quoted = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(input: string): ParsedCsv {
  if (typeof input !== "string") throw new CleanerError("CSV must be text.");
  if (input.length > MAX_CHARS) {
    throw new CleanerError("CSV exceeds 750,000 characters.");
  }

  let bom = false;
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  if (text.trim() === "") throw new CleanerError("CSV is empty.");

  const newline = detectNewline(text);
  const delimiter = detectDelimiter(text);
  const records = parseRecords(text, delimiter);
  if (records.length === 0) throw new CleanerError("CSV is empty.");
  if (records.length - 1 > MAX_ROWS) {
    throw new CleanerError("CSV exceeds 20,000 data rows.");
  }

  const headers = records[0];
  const width = Math.max(headers.length, 1);
  const ragged: { row: number; width: number }[] = [];
  const rows = records.slice(1).map((record, index) => {
    if (record.length !== width) ragged.push({ row: index + 2, width: record.length });
    const cells = record.slice(0, width);
    while (cells.length < width) cells.push("");
    return cells;
  });

  return { bom, newline, delimiter, headers, rows, ragged };
}

function needsQuotes(value: string, delimiter: string): boolean {
  return value.includes('"') || value.includes("\n") || value.includes("\r") || value.includes(delimiter);
}

export function serializeCsv(
  headers: string[],
  rows: string[][],
  delimiter: string,
  newline: "\n" | "\r\n" | "\r",
  bom: boolean,
): string {
  const esc = (value: string) =>
    needsQuotes(value, delimiter) ? `"${value.replaceAll('"', '""')}"` : value;
  const body = [headers, ...rows].map((record) => record.map(esc).join(delimiter)).join(newline);
  const text = `${body}${newline}`;
  return bom ? `\uFEFF${text}` : text;
}
