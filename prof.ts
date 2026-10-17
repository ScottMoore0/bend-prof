#!/usr/bin/env bun
// bend-prof: where does `bend <file> --check-only` spend its time?
//
// Loads a file the way the CLI does, then checks it one order entry at a time
// on one book: book_valid(book, i) with the order cut after entry i takes the
// first i entries as validated (they were, by the previous step) and checks
// entry i. The book keeps its checked bodies and its template instances, so
// the per-entry times add up to an ordinary check.
//
//   BEND_SRC=<bend checkout> bun prof.ts <file.bend> [top=15]
import * as fs from "node:fs";
import * as path from "node:path";

const src = process.env.BEND_SRC;
if (!src) {
  console.error("set BEND_SRC to a bendlang/bend checkout (the CLI binary has no importable checker)");
  process.exit(2);
}
const B = await import(path.join(src, "bend2", "bend.ts"));
const file = path.resolve(process.argv[2] ?? "");
const top = Number(process.argv[3] ?? 15);

const book = B.book_nil();
const seen = new Map<string, string | null>();
const t0 = performance.now();
await B.book_load(book, file, "", seen);
const load = performance.now() - t0;

const order: string[] = [...book.order];
const last = new Map<string, number>();
order.forEach((k, i) => last.set(k, i));
const first = new Map<string, number>();
order.forEach((k, i) => { if (!first.has(k)) first.set(k, i); });

const ms: number[] = [];
let failed = "";
for (let i = 0; i < order.length; i++) {
  book.order = order.slice(0, i + 1);
  // a law's statement comes before its proof: hide the body there, as the
  // whole order does, so the proof is checked (and timed) once, at its fill
  const k = order[i];
  const def = book.tlds[k];
  const early = last.get(k)! > i && def?.$ === "Def" && def.v !== null;
  if (early) {
    book.tlds[k] = { ...def, v: null };
  }
  const t = performance.now();
  try {
    B.book_valid(book, i);
  } catch (e) {
    ms.push(performance.now() - t);
    const msg = typeof e === "string" ? e : (e as { $?: string })?.$ === "Err" ? B.err_show(e) : String(e);
    failed = k + ": " + msg.split("\n").slice(0, 3).join(" ");
    break;
  }
  ms.push(performance.now() - t);
  if (early) {
    book.tlds[k] = def;
    book.hols -= 1;
  }
}
const total = ms.reduce((a, b) => a + b, 0);

// a def's file and line, from its type's span. Spans name a file by namespace
// (seen maps a path to it); the root file and Base share "", and Base's defs
// carry b
const nsPath = new Map<string, string>();
let basePath = "";
seen.forEach((ns, f) => {
  if (ns) {
    nsPath.set(ns, f);
  } else if (f !== fs.realpathSync(file)) {
    basePath = f;
  }
});
function where(k: string): string {
  const d = book.tlds[k] as { b?: boolean; T?: { s?: { file: { ns: string; str: string }; beg: number } } };
  const s = d?.T?.s;
  if (!s) {
    return "";
  }
  const line = s.file.str.slice(0, s.beg).split("\n").length;
  const f = s.file.ns ? nsPath.get(s.file.ns) : d.b ? basePath : file;
  return (f ? path.relative(process.cwd(), f) : s.file.ns || "?") + ":" + String(line);
}

function label(i: number): string {
  const k = order[i];
  return last.get(k)! > i ? k + " (statement)" : first.get(k)! < i ? k + " (proof)" : k;
}

console.log(`${path.relative(process.cwd(), file)}: ${order.length} entries, load ${load.toFixed(0)} ms, check ${total.toFixed(0)} ms`);
console.log("      ms      %  def");
const rows = ms.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t).slice(0, top);
for (const r of rows) {
  console.log(`${r.t.toFixed(1).padStart(8)} ${(100 * r.t / total).toFixed(1).padStart(5)}%  ${label(r.i)}  ${where(order[r.i])}`);
}
const mods = new Map<string, number>();
ms.forEach((t, i) => {
  const k = order[i];
  const m = k.includes(":") ? k.slice(0, k.indexOf(":")) : "(this file and Base)";
  mods.set(m, (mods.get(m) ?? 0) + t);
});
console.log("by module: " + [...mods].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, t]) => `${m} ${t.toFixed(0)} ms`).join(", "));
if (failed) {
  console.log("stopped at the first failure: " + failed);
}
