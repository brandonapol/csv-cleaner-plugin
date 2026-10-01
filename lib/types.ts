export type DateOrderOption = "auto" | "mdy" | "dmy" | "ymd";
export type DuplicateMode = "exact" | "normalized";
export type DuplicateKeep = "first" | "last";
export type SourceEncoding = "utf-8" | "windows-1252" | "utf-16le";

export type ScanOptions = {
  dateOrder?: DateOrderOption;
  duplicateMode?: DuplicateMode;
  duplicateKeep?: DuplicateKeep;
  sourceEncoding?: SourceEncoding;
};

export type FindingKind = "encoding" | "date" | "duplicate";

export type Finding = {
  id: string;
  kind: FindingKind;
  severity: "error" | "warning";
  safe: boolean;
  fixable: boolean;
  title: string;
  detail: string;
  row?: number;
  column?: string;
  relatedRows?: number[];
  before?: string;
  after?: string;
};

export type ScanReport = {
  delimiter: string;
  newline: "lf" | "crlf" | "cr" | "mixed";
  rowCount: number;
  columnCount: number;
  headers: string[];
  inferredDateOrder: "mdy" | "dmy" | "ymd" | null;
  dateOrderUsed: "mdy" | "dmy" | "ymd";
  findings: Finding[];
  summary: {
    encoding: number;
    date: number;
    duplicate: number;
    fixable: number;
    safe: number;
  };
};

export type ApplyRequest = {
  csv: string;
  accept?: string[];
  reject?: string[];
  acceptSafe?: boolean;
  options?: ScanOptions;
};

export type ApplyResult = {
  csv: string;
  applied: string[];
  skipped: string[];
  unknown: string[];
  report: ScanReport;
};
