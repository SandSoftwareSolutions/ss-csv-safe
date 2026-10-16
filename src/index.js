/** Guess the delimiter of a CSV text from its first line: semicolon (Dutch Excel), comma, tab or pipe. */
export function detectDelimiter(text) {
  const firstLine = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t", "|"]) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === candidate && !quoted) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses CSV (RFC 4180): quotes, doubled quotes, newlines inside quotes, CRLF or LF, a leading byte order mark.
 * Returns an array of rows (arrays of strings), or with `header: true` an array of objects keyed by the first row.
 * The delimiter is detected unless you pass one. A quote that is never closed is an error, not silently swallowed.
 */
export function parseCsv(text, { delimiter, header = false } = {}) {
  if (typeof text !== "string") throw new TypeError("parseCsv: text must be a string");
  const source = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(source);
  if (typeof sep !== "string" || sep.length !== 1 || sep === '"' || sep === "\n" || sep === "\r") throw new TypeError("parseCsv: the delimiter must be one character that is not a quote or a newline");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let wasQuotedRow = false;
  const endField = () => {
    row.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === "" && !wasQuotedRow)) rows.push(row);
    row = [];
    wasQuotedRow = false;
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      wasQuotedRow = true;
    } else if (ch === sep) endField();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (quoted) throw new Error("parseCsv: a quoted field is never closed");
  if (field !== "" || row.length > 0 || wasQuoted) endRow();
  if (!header) return rows;
  const [names = [], ...body] = rows;
  return body.map((cells) => Object.fromEntries(names.map((name, i) => [name, cells[i] ?? ""])));
}

const DANGEROUS = /^[=+\-@\t\r]/;

/**
 * Makes a value safe to put in a CSV that someone opens in Excel or Sheets: a text that starts with = + - @ (or a tab or
 * carriage return) would be run as a formula, so it gets a leading apostrophe. Numbers and booleans are left alone.
 */
export function neutralize(value) {
  return typeof value === "string" && DANGEROUS.test(value) ? `'${value}` : value;
}

function cell(value, sep, safe) {
  if (value === null || value === undefined) return "";
  let text;
  if (value instanceof Date) text = Number.isNaN(value.getTime()) ? "" : value.toISOString();
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);
  if (safe && typeof value === "string") text = neutralize(text);
  return text.includes(sep) || /["\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Writes CSV from an array of objects or of arrays. Safe by default against formula injection (see `neutralize`;
 * `safe: false` turns it off). Options: `columns` (order and selection for objects), `header` (default true for objects),
 * `delimiter` (default ","), `eol` (default "\r\n"), `bom` (a byte order mark, so Excel reads UTF-8 correctly).
 * `excel: true` is the Dutch Excel preset: semicolon and byte order mark.
 */
export function stringifyCsv(rows, { columns, header, delimiter, eol = "\r\n", bom, safe = true, excel = false } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("stringifyCsv: rows must be an array");
  const sep = delimiter ?? (excel ? ";" : ",");
  const lines = [];
  const objects = rows.length > 0 && rows.every((r) => r !== null && typeof r === "object" && !Array.isArray(r));
  if (objects) {
    const names = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
    if (header ?? true) lines.push(names.map((n) => cell(n, sep, safe)).join(sep));
    for (const r of rows) lines.push(names.map((n) => cell(r[n], sep, safe)).join(sep));
  } else {
    if (columns && (header ?? true)) lines.push(columns.map((n) => cell(n, sep, safe)).join(sep));
    for (const r of rows) {
      if (!Array.isArray(r)) throw new TypeError("stringifyCsv: rows must be all objects or all arrays");
      lines.push(r.map((v) => cell(v, sep, safe)).join(sep));
    }
  }
  const body = lines.length > 0 ? lines.join(eol) + eol : "";
  return (bom ?? excel ? "﻿" : "") + body;
}
