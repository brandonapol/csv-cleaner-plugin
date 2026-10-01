/** Byte values Windows-1252 assigns to the printable characters that Latin-1 would leave as controls. */
const CP1252_BYTE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const STRONG =
  /(?:\u00C3[\u0080-\u00FF]|\u00C2[\u0080-\u00FF]|\u00E2[\u0080-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178])/;

/** Recover text that was UTF-8, misread as Windows-1252 or Latin-1. Returns null when it is not sure. */
export function repairMojibake(value: string): string | null {
  if (!value || value.length < 2 || !STRONG.test(value)) return null;

  const bytes: number[] = [];
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) bytes.push(cp);
    else if (CP1252_BYTE[cp] !== undefined) bytes.push(CP1252_BYTE[cp]);
    else return null;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    if (!decoded || decoded === value || decoded.includes("\uFFFD")) return null;
    if (decoded.length >= value.length) return null;
    return decoded;
  } catch {
    return null;
  }
}
