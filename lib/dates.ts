export type DateOrder = "mdy" | "dmy" | "ymd";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type CellDate =
  | { kind: "skip" }
  | { kind: "iso" }
  | { kind: "invalid"; reason: string }
  | { kind: "fix"; iso: string; ambiguous: boolean; via: "numeric" | "named" | "excel" };

export function isDateHeader(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (/date|dob|birth|born|hired|timestamp/.test(n)) return true;
  return /(^|_)(created|updated)(_at)?$/.test(n);
}

export function isStrictDateShape(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return (
    /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(v) ||
    /^\d{1,2}[/.\\-]\d{1,2}[/.\\-]\d{2,4}$/.test(v) ||
    /^\d{4}[/.]\d{1,2}[/.]\d{1,2}$/.test(v) ||
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(v) ||
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(v) ||
    /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(v)
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isValid(y: number, m: number, d: number): boolean {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function reasonInvalid(y: number, m: number, d: number): string {
  if (m < 1 || m > 12) return `month ${m} is outside 1–12`;
  if (y < 1000 || y > 9999) return `year ${y} is out of range`;
  const dim = daysInMonth(y, m);
  if (d > dim) return `${MONTH_NAMES[m]} ${y} has no day ${d}`;
  return "not a real calendar date";
}

function expandYear(n: number): number {
  if (n >= 100) return n;
  return n >= 70 ? 1900 + n : 2000 + n;
}

/** Excel's day 0 is 1899-12-30 because of the Lotus 1-2-3 leap-year bug. */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isInteger(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  const date = new Date(ms);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function named(monthName: string, day: number, year: number): CellDate {
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return { kind: "invalid", reason: `unknown month "${monthName}"` };
  const y = expandYear(year);
  if (!isValid(y, month, day)) return { kind: "invalid", reason: reasonInvalid(y, month, day) };
  return { kind: "fix", iso: isoDate(y, month, day), ambiguous: false, via: "named" };
}

function numeric(a: number, b: number, c: number, order: DateOrder): CellDate {
  if (a > 999) {
    if (!isValid(a, b, c)) return { kind: "invalid", reason: reasonInvalid(a, b, c) };
    return { kind: "fix", iso: isoDate(a, b, c), ambiguous: false, via: "numeric" };
  }

  const year = expandYear(c);
  if (a > 31 || b > 31) return { kind: "invalid", reason: reasonInvalid(year, a, b) };

  const asMdy = isValid(year, a, b);
  const asDmy = isValid(year, b, a);
  if (a > 12 && b > 12) return { kind: "invalid", reason: reasonInvalid(year, a, b) };

  let month = a;
  let day = b;
  let ambiguous = false;

  if (a > 12 && asDmy) {
    month = b;
    day = a;
  } else if (b > 12 && asMdy) {
    month = a;
    day = b;
  } else if (asMdy && asDmy && a !== b) {
    ambiguous = true;
    if (order === "dmy") {
      month = b;
      day = a;
    } else {
      month = a;
      day = b;
    }
  } else if (asMdy) {
    month = a;
    day = b;
  } else if (asDmy) {
    month = b;
    day = a;
  } else {
    return { kind: "invalid", reason: reasonInvalid(year, order === "dmy" ? b : a, order === "dmy" ? a : b) };
  }

  if (order === "ymd" && ambiguous) {
    return { kind: "fix", iso: isoDate(year, month, day), ambiguous: true, via: "numeric" };
  }

  return { kind: "fix", iso: isoDate(year, month, day), ambiguous, via: "numeric" };
}

export function inspectDate(raw: string, order: DateOrder, allowExcel: boolean): CellDate {
  const value = raw.trim();
  if (!value) return { kind: "skip" };

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z)?)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (!isValid(y, m, d)) return { kind: "invalid", reason: reasonInvalid(y, m, d) };
    if (!iso[4]) return { kind: "iso" };
    const hh = Number(iso[4]);
    const mm = Number(iso[5]);
    const ss = iso[6] === undefined ? 0 : Number(iso[6]);
    if (hh > 23 || mm > 59 || ss > 59) return { kind: "invalid", reason: "time is not valid" };
    const time = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    const canonical = `${isoDate(y, m, d)}T${time}${iso[7] ?? ""}`;
    if (value === canonical) return { kind: "iso" };
    return { kind: "fix", iso: canonical, ambiguous: false, via: "named" };
  }

  let match = value.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) return named(match[1], Number(match[2]), Number(match[3]));
  match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) return named(match[2], Number(match[1]), Number(match[3]));
  match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (match) return named(match[2], Number(match[1]), Number(match[3]));

  if (allowExcel && /^\d{5}$/.test(value)) {
    const excel = fromExcelSerial(Number(value));
    if (excel) return { kind: "fix", iso: excel, ambiguous: false, via: "excel" };
  }

  match = value.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (match) return numeric(Number(match[1]), Number(match[2]), Number(match[3]), "ymd");
  match = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (match) return numeric(Number(match[1]), Number(match[2]), Number(match[3]), order);
  match = value.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (match) return numeric(Number(match[1]), Number(match[2]), Number(match[3]), order);

  return { kind: "invalid", reason: "not a recognized date" };
}

export function inferDateOrder(rows: string[][], columns: number[]): DateOrder | null {
  let mdy = 0;
  let dmy = 0;
  let ymd = 0;
  for (const row of rows) {
    for (const column of columns) {
      const value = row[column]?.trim() ?? "";
      const yearFirst = value.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
      if (yearFirst) {
        ymd++;
        continue;
      }
      const match = value.match(/^(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{2,4})$/);
      if (!match) continue;
      const a = Number(match[1]);
      const b = Number(match[2]);
      if (a > 12 && b <= 12) dmy++;
      else if (b > 12 && a <= 12) mdy++;
    }
  }
  if (dmy > 0 && mdy === 0) return "dmy";
  if (mdy > 0 && dmy === 0) return "mdy";
  if (ymd > 0 && mdy === 0 && dmy === 0) return "ymd";
  return null;
}
