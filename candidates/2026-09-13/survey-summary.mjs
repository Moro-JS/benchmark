// Fold the rotated-order rounds of a survey into per-cell medians (and the
// per-round values), per generator: rows x {plain req/s, conn/s, p99@rate,
// CPU us/req, instructions/req when perf ran}.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const files = readdirSync(dir).filter(f => /^results-2026-09-1[3-9]T.*\.json$/.test(f)).sort();
const byGen = new Map(); // generator -> [{row, cell, value}]
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const f of files) {
  const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const gen = (r.profileLine.match(/no pipelining \[(\w+)\]/) || [])[1] || '?';
  if (!byGen.has(gen)) byGen.set(gen, new Map());
  const cells = byGen.get(gen);
  for (const row of r.rows) {
    const add = (cell, v) => { if (v == null) return; const k = `${row.key}|${cell}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(v); };
    for (const [label, p] of Object.entries(row.byProfile)) {
      const n = p.requestsTotal;
      const instr = p.perf && p.perf.counters && p.perf.counters.instructions && n ? p.perf.counters.instructions / n / 1000 : null;
      if (/^no pipelining/.test(label)) { add('plain req/s', p.reqSec); add('CPU us/req', p.cpuUsPerReq); add('k instr/req', instr); }
      else if (/keep-alive off/.test(label)) { add('conn/s', p.reqSec); add('CPU us/conn', p.cpuUsPerReq); add('churn errors', p.errors); }
      else if (/fixed rate/.test(label)) { add('p99@rate ms', p.latP99Ms); add('CPU us/req@rate', p.cpuUsPerReq); }
    }
    add('RSS MB', row.rssMb);
  }
}
const ROWS = ['engine-local', 'raw-engine-local', 'raw-bun', 'raw-uws'];
const CELLS = ['plain req/s', 'CPU us/req', 'k instr/req', 'conn/s', 'CPU us/conn', 'churn errors', 'p99@rate ms', 'CPU us/req@rate', 'RSS MB'];
for (const [gen, cells] of byGen) {
  console.log(`\n=== ${gen}`);
  console.log('cell'.padEnd(18) + ROWS.map(r => r.padStart(22)).join(''));
  for (const cell of CELLS) {
    const line = [cell.padEnd(18)];
    let any = false;
    for (const row of ROWS) { const v = cells.get(`${row}|${cell}`); if (!v) { line.push(''.padStart(22)); continue; } any = true; const m = median(v); const fmt = x => x >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(2); line.push(`${fmt(m)} [${v.map(fmt).join('/')}]`.padStart(22)); }
    if (any) console.log(line.join(''));
  }
}
