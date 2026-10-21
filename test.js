import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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

test("every formula prefix is neutralized: = + - @ tab and carriage return (also in the header and when quoting is needed)", () => {
  for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
    assert.equal(neutralize(`${prefix}cmd`), `'${prefix}cmd`, JSON.stringify(prefix));
    const csv = stringifyCsv([{ [`${prefix}head`]: `${prefix}1+1` }]);
    const [[head], [value]] = parseCsv(csv, { delimiter: "," });
    assert.equal(head, `'${prefix}head`);
    assert.equal(value, `'${prefix}1+1`);
  }
  assert.equal(neutralize("a=1"), "a=1");
  assert.equal(neutralize(-5), -5);
});

test("a row with one empty cell is written as \"\" so it does not vanish as a blank line", () => {
  assert.equal(stringifyCsv([[""]]), '""\r\n');
  assert.deepEqual(parseCsv(stringifyCsv([["a"], [""], ["b"]])), [["a"], [""], ["b"]]);
  assert.deepEqual(parseCsv(stringifyCsv([{ a: "x" }, { a: "" }]), { header: true }), [{ a: "x" }, { a: "" }]);
});

test("a toJSON that returns undefined gives an empty cell instead of a TypeError", () => {
  assert.equal(stringifyCsv([[{ toJSON() { return undefined; } }, "x"]]), ",x\r\n");
});

test("random tables: write then read gives the same table (every delimiter, LF and CRLF); safe mode gives neutralize() of each cell", () => {
  const pool = ["", "a", "b c", " ,", ";", "\t", "|", '"', '""', "\n", "\r", "\r\n", "=", "+", "-", "@", "=1+1", "é", "😀", "x\ny", "'", "  ", "a,b", " "];
  const pick = (n) => randomBytes(1)[0] % n;
  const field = () => Array.from({ length: pick(4) }, () => pool[pick(pool.length)]).join("");
  for (let i = 0; i < 400; i++) {
    const columns = 1 + pick(4);
    const rows = Array.from({ length: 1 + pick(5) }, () => Array.from({ length: columns }, field));
    for (const delimiter of [",", ";", "\t", "|"]) {
      for (const eol of ["\r\n", "\n"]) {
        assert.deepEqual(parseCsv(stringifyCsv(rows, { safe: false, delimiter, eol }), { delimiter }), rows);
        assert.deepEqual(parseCsv(stringifyCsv(rows, { delimiter, eol }), { delimiter }), rows.map((r) => r.map(neutralize)));
      }
    }
  }
});

test("strict: a quote inside an unquoted field and text after a closing quote are errors; well-formed input is unchanged", () => {
  for (const bad of ['a,b"c\n', 'a,"b"c\n', '"a"b,c\n', 'a,b "c"\n']) {
    assert.throws(() => parseCsv(bad, { delimiter: ",", strict: true }), /quote|closing/, JSON.stringify(bad));
    assert.doesNotThrow(() => parseCsv(bad, { delimiter: "," }), JSON.stringify(bad));
  }
  for (const good of ['a,"b"\n', '"a","b"', 'a,"b""c"\r\n', '"x\ny",z\n', 'a,\n"",""\n', '']) {
    assert.deepEqual(parseCsv(good, { delimiter: ",", strict: true }), parseCsv(good, { delimiter: "," }), JSON.stringify(good));
  }
  assert.throws(() => parseCsv('a,"b', { strict: true }), /never closed/);
});

test("trim: spaces and tabs around fields and around quotes are dropped, text inside quotes is kept", () => {
  assert.deepEqual(parseCsv(' a , "  b  " ,\t"c"\t\n', { delimiter: ",", trim: true }), [["a", "  b  ", "c"]]);
  assert.deepEqual(parseCsv(' a , b ', { delimiter: "," }), [[" a ", " b "]]);
  assert.throws(() => parseCsv('"a" x,b', { delimiter: ",", trim: true, strict: true }), /after the closing quote/);
});
