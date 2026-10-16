export type Cell = string | number | boolean | bigint | Date | null | undefined | object;

export function detectDelimiter(text: string): "," | ";" | "\t" | "|";

export function parseCsv(text: string, options: { delimiter?: string; header: true }): Record<string, string>[];
export function parseCsv(text: string, options?: { delimiter?: string; header?: false }): string[][];

export function neutralize<T>(value: T): T | string;

export interface StringifyOptions {
  columns?: readonly string[];
  header?: boolean;
  delimiter?: string;
  eol?: string;
  bom?: boolean;
  /** Protect against formula injection. Default true. */
  safe?: boolean;
  /** Semicolon and byte order mark, as Dutch Excel wants it. */
  excel?: boolean;
}

export function stringifyCsv(rows: readonly Record<string, Cell>[] | readonly Cell[][], options?: StringifyOptions): string;
