import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFixes, scanCsv } from "./engine.ts";
import { repairMojibake } from "./repair.ts";

const dirty = [
  "name,hired,notes",
  "Ada,03/04/1843,ok",
  "Ada,03/04/1843,ok",
  "Alan,31/06/1912,bad",
  "Grace,26/08/1906,Caf\u00C3\u00A9",
  "Jane,2024-02-30,nope",
].join("\n");

test("repairs classic mojibake and leaves real unicode alone", () => {
  assert.equal(repairMojibake("Caf\u00C3\u00A9"), "Caf\u00E9");
  assert.equal(repairMojibake("caf\u00E9"), null);
  assert.equal(repairMojibake("plain"), null);
});

test("flags a bad date, an ambiguous date, mojibake, and an exact duplicate", () => {
  const report = scanCsv(dirty, { dateOrder: "auto" });
  const ids = report.findings.map((finding) => finding.id);
  assert.ok(ids.some((id) => id.startsWith("date:invalid:")));
  assert.ok(ids.some((id) => id.startsWith("date:ambiguous:")));
  assert.ok(ids.some((id) => id.startsWith("date:normalize:")));
  assert.ok(ids.some((id) => id.startsWith("encoding:mojibake:")));
  assert.ok(ids.some((id) => id.startsWith("duplicate:exact:")));
  assert.equal(report.inferredDateOrder, "dmy");
  assert.equal(report.findings.find((f) => f.id.startsWith("date:invalid:"))?.fixable, false);
});

test("accepting nothing returns the original text", () => {
  const result = applyFixes(`${dirty}\n`, { csv: `${dirty}\n`, accept: [] });
  assert.equal(result.csv, `${dirty}\n`);
  assert.deepEqual(result.applied, []);
});

test("safe fixes repair mojibake and exact dupes, not invalid or ambiguous dates", () => {
  const result = applyFixes(dirty, {
    csv: dirty,
    acceptSafe: true,
    options: { dateOrder: "auto" },
  });
  assert.ok(result.csv.includes("31/06/1912"));
  assert.ok(result.csv.includes("2024-02-30"));
  assert.ok(result.csv.includes("03/04/1843"));
  assert.ok(result.csv.includes("Caf\u00E9"));
  assert.ok(result.csv.includes("1906-08-26"));
  assert.equal(result.csv.split("\n").filter((line) => line.startsWith("Ada")).length, 1);
  assert.ok(result.applied.some((id) => id.startsWith("encoding:mojibake:")));
  assert.ok(result.applied.some((id) => id.startsWith("duplicate:exact:")));
  assert.ok(!result.applied.some((id) => id.startsWith("date:ambiguous:")));
  assert.ok(!result.applied.some((id) => id.startsWith("date:invalid:")));
});

test("an accepted duplicate is dropped and reject wins over acceptSafe", () => {
  const scan = scanCsv(dirty);
  const dupe = scan.findings.find((f) => f.kind === "duplicate");
  assert.ok(dupe);
  const dropped = applyFixes(dirty, { csv: dirty, accept: [dupe.id] });
  assert.equal(dropped.csv.split("\n").filter((line) => line.startsWith("Ada")).length, 1);

  const kept = applyFixes(dirty, {
    csv: dirty,
    acceptSafe: true,
    reject: [dupe.id],
    options: { duplicateMode: "exact" },
  });
  assert.ok(!kept.applied.includes(dupe.id));
  assert.equal(kept.csv.split("\n").filter((line) => line.startsWith("Ada")).length, 2);
});

test("unknown ids are reported and quoted commas survive a rewrite", () => {
  const csv = '"Doe, Jane",hired\n"Doe, Jane",26/08/1918\n';
  const result = applyFixes(csv, { csv, accept: ["date:missing"], acceptSafe: true });
  assert.deepEqual(result.unknown, ["date:missing"]);
  assert.match(result.csv, /"Doe, Jane"/);
  assert.match(result.csv, /1918-08-26/);
});

test("a clean file produces no findings", () => {
  const report = scanCsv("name,hired\nAda,1843-04-03\n");
  assert.deepEqual(report.findings, []);
});

test("BOM and mixed newlines are optional fixes", () => {
  const csv = "\uFEFFname\r\nAda\nGrace\n";
  const report = scanCsv(csv);
  assert.ok(report.findings.some((f) => f.id === "encoding:bom"));
  assert.ok(report.findings.some((f) => f.id === "encoding:newlines"));
  const result = applyFixes(csv, { csv, accept: ["encoding:bom", "encoding:newlines"] });
  assert.equal(result.csv, "name\nAda\nGrace\n");
});

test("normalized mode catches case and whitespace copies", () => {
  const csv = "name,city\nAda,London\n ada , london \n";
  assert.equal(scanCsv(csv, { duplicateMode: "exact" }).summary.duplicate, 0);
  const report = scanCsv(csv, { duplicateMode: "normalized" });
  assert.equal(report.summary.duplicate, 1);
  assert.equal(report.findings[0]?.safe, false);
});
