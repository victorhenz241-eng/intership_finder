// Runs the people search locally for a company and prints the ranked list.
// Needs SERPER_API_KEY in .env.   node scripts/people-smoke.mjs "Perpay" "Data Science Intern"
import { readFileSync } from "node:fs";
import { searchPeople, toHooks } from "../src/lib/people.ts";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const [company = "Perpay", title = "Data Science Intern"] = process.argv.slice(2);
const t0 = Date.now();
const { candidates, queries } = await searchPeople(company, title, process.env.SERPER_API_KEY);
console.log(`${company}: ${candidates.length} people from ${queries} queries in ${Date.now() - t0}ms`);
for (const c of candidates.slice(0, 8)) console.log(`${String(c.score).padStart(4)}  ${c.bucket.padEnd(6)} ${c.name} — ${c.title ?? "?"}\n      ${c.reason} | ${c.url}`);
console.log("\nstored:", JSON.stringify(toHooks(candidates), null, 1));
