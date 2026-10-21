# @sandsoftwaresolutions/csv-safe

[![CI](https://github.com/SandSoftwareSolutions/ss-csv-safe/actions/workflows/ci.yml/badge.svg)](https://github.com/SandSoftwareSolutions/ss-csv-safe/actions/workflows/ci.yml)

Read and write CSV without surprises, and without the classic security hole: a cell that starts with `=` is run as a formula when someone opens your export in Excel. This package neutralizes that by default. No dependencies.

## Install

```bash
npm install @sandsoftwaresolutions/csv-safe
```

Works with `import` and `require()`, and ships TypeScript types for both.

## Write

```js
import { stringifyCsv } from "@sandsoftwaresolutions/csv-safe";

const csv = stringifyCsv(
  [{ naam: "Kaj", opmerking: '=HYPERLINK("http://evil")', bedrag: -3.5 }],
  { excel: true } // semicolon + byte order mark, as Dutch Excel wants it
);
// naam;opmerking;bedrag
// Kaj;"'=HYPERLINK(""http://evil"")";-3.5
```

- Objects or arrays in, one text out. Fields are quoted only when needed.
- Texts that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading apostrophe. **Numbers are not touched**, so `-3.5` stays a number. Turn this off with `safe: false` only for data you fully control.
- Options: `columns` (order and selection), `header`, `delimiter`, `eol` (default `\r\n`), `bom`, `excel`.
- `null` and `undefined` become empty, dates become ISO 8601, other objects become JSON.

## Read

```js
import { parseCsv } from "@sandsoftwaresolutions/csv-safe";

parseCsv(text);                    // [["naam","stad"],["Kaj","Haarlem"]]
parseCsv(text, { header: true });  // [{ naam: "Kaj", stad: "Haarlem" }]
parseCsv(text, { strict: true });  // throws on a stray quote or text after a closing quote (use for uploads)
parseCsv(text, { trim: true });    // drops spaces and tabs around fields, also around quotes
```

Handles quotes, doubled quotes, line breaks inside quotes, CRLF and LF, and a leading byte order mark. The delimiter (`,` `;` tab `|`) is detected from the first line unless you pass `delimiter`. An unclosed quote throws an error instead of silently eating the rest of the file. Values stay strings: converting them is your call.

## Also

`neutralize(value)` is the formula protection on its own, and `detectDelimiter(text)` the delimiter guess.

## Good to know

- Reading is not "safe" or "unsafe": the danger is in what you write for someone else to open. If you re-export data that came from users, keep `safe` on.
- The apostrophe shows in the cell as text in some programs. That is the price of not running attacker-controlled formulas.
- A row whose only cell is empty is written as `""`, because an empty line is a blank line to every reader and would disappear.
- With `header: true`, a row shorter than the header is filled with `""`, cells beyond the header are dropped, and a repeated column name keeps the last value. Use the array form if you need every cell.
- The delimiter guess looks at the first line only; pass `delimiter` when your header might contain tabs, semicolons or pipes inside names.
