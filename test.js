import assert from "node:assert/strict";
import { test } from "node:test";

import { detectDelimiter, neutralize, parseCsv, stringifyCsv } from "./src/index.js";

test("parses quotes, doubled quotes, embedded newlines and both line endings", () => {
  assert.deepEqual(parseCsv('a,b\r\n1,"x, ""y"""\n"multi\nline",3'), [["a", "b"], ["1", 'x, "y"'], ["multi\nline", "3"]]);
  assert.deepEqual(parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a,b\r1,2"), [["a", "b"], ["1", "2"]]);
});

test("empty fields, empty lines and a quoted empty line", () => {
  assert.deepEqual(parseCsv("a,,c\n,,\n\nx,y,z"), [["a", "", "c"], ["", "", ""], ["x", "y", "z"]]);
  assert.deepEqual(parseCsv('""\nx'), [[""], ["x"]]);
  assert.deepEqual(parseCsv(""), []);
});

test("byte order mark and delimiter detection", () => {
  assert.deepEqual(parseCsv("﻿naam;stad\nKaj;Haarlem"), [["naam", "stad"], ["Kaj", "Haarlem"]]);
  assert.equal(detectDelimiter("a;b;c"), ";");
  assert.equal(detectDelimiter("a\tb"), "\t");
  assert.equal(detectDelimiter('"a,b,c";d'), ";");
  assert.equal(detectDelimiter("alleen"), ",");
});

test("header mode gives objects and pads short rows", () => {
  assert.deepEqual(parseCsv("naam,stad\nKaj,Haarlem\nEen", { header: true }), [{ naam: "Kaj", stad: "Haarlem" }, { naam: "Een", stad: "" }]);
});

test("an unclosed quote and a bad delimiter are errors", () => {
  assert.throws(() => parseCsv('a,"b'), /never closed/);
  assert.throws(() => parseCsv("a", { delimiter: '"' }), TypeError);
  assert.throws(() => parseCsv("a", { delimiter: ",," }), TypeError);
  assert.throws(() => parseCsv(5), TypeError);
});

test("stringify quotes only when needed", () => {
  const out = stringifyCsv([{ naam: "Kaj", opm: 'zegt "hoi", ja', n: 1.5, leeg: null }, { naam: "Bo\nb", opm: " spatie", n: true }]);
  assert.equal(out, 'naam,opm,n,leeg\r\nKaj,"zegt ""hoi"", ja",1.5,\r\n"Bo\nb"," spatie",true,\r\n');
});

test("formula injection is neutralized, numbers are not touched", () => {
  assert.equal(neutralize("=1+1"), "'=1+1");
  assert.equal(neutralize("-5 euro"), "'-5 euro");
  assert.equal(neutralize(-5), -5);
  assert.equal(neutralize("gewoon"), "gewoon");
  assert.equal(stringifyCsv([{ a: '=HYPERLINK("http://evil")', b: -3, c: "+31612345678" }]), `a,b,c\r\n"'=HYPERLINK(""http://evil"")",-3,'+31612345678\r\n`);
  assert.equal(stringifyCsv([{ a: "=1" }], { safe: false }), "a\r\n=1\r\n");
});

test("columns, arrays, dates, objects, excel preset", () => {
  assert.equal(stringifyCsv([{ a: 1, b: 2, c: 3 }], { columns: ["c", "a"] }), "c,a\r\n3,1\r\n");
  assert.equal(stringifyCsv([[1, "x"], [2, "y"]]), "1,x\r\n2,y\r\n");
  assert.equal(stringifyCsv([[1, 2]], { columns: ["a", "b"] }), "a,b\r\n1,2\r\n");
  assert.equal(stringifyCsv([{ d: new Date("2026-10-17T00:00:00Z"), o: { x: 1 } }]), 'd,o\r\n2026-10-17T00:00:00.000Z,"{""x"":1}"\r\n');
  assert.equal(stringifyCsv([{ a: "x;y", b: 1 }], { excel: true }), '﻿a;b\r\n"x;y";1\r\n');
  assert.equal(stringifyCsv([]), "");
  assert.throws(() => stringifyCsv([[1], { a: 1 }]), TypeError);
});

test("what is written can be read back", () => {
  const rows = [{ naam: "Kaj", opm: 'a "b", c\nd', n: "1" }, { naam: "Een;ander", opm: "", n: "2" }];
  assert.deepEqual(parseCsv(stringifyCsv(rows), { header: true }), rows);
  assert.deepEqual(parseCsv(stringifyCsv(rows, { excel: true }), { header: true }), rows);
});
