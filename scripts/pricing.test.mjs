/* The billing arithmetic, checked. Getting this wrong either overcharges a
   customer or repeats the loss the minute pricing exists to stop. */
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind } from '../node_modules/typescript/lib/typescript.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const src = readFileSync(new URL('../lib/pricing.ts', import.meta.url), 'utf8');
const js = transpileModule(src, { compilerOptions: { module: ModuleKind.ESNext, target: 99 } }).outputText;
const dir = mkdtempSync(path.join(tmpdir(), 'pricing-'));
const file = path.join(dir, 'pricing.mjs');
writeFileSync(file, js);
const { PLANS, planFor, usageFor, callsFor, breakEvenMinutes, COST_PER_MINUTE } = await import(file);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n} ${x}`); } };
const near = (a, b) => Math.abs(a - b) < 0.005;

console.log('plans');
ok('starter is 300 min, 3 min cap, $0.35 over',
  PLANS[0].minutes === 300 && PLANS[0].maxCallMinutes === 3 && PLANS[0].overageRate === 0.35);
ok('pro is 1000 min, 5 min cap, $0.28 over',
  PLANS[1].minutes === 1000 && PLANS[1].maxCallMinutes === 5 && PLANS[1].overageRate === 0.28);
ok('enterprise is 3000 min, 8 min cap, $0.20 over',
  PLANS[2].minutes === 3000 && PLANS[2].maxCallMinutes === 8 && PLANS[2].overageRate === 0.20);
ok('pro keeps most-popular', PLANS[1].highlight === true);
ok('unknown plan falls back to starter', planFor('nonsense').id === 'starter');
ok('callsFor reads as a range', /~100–150 calls/.test(callsFor(300)), callsFor(300));

console.log('\nusage');
const fresh = usageFor({ plan: 'starter', monthly_minutes_included: 300, minutes_used_this_month: 0 });
ok('unused reads 0%', fresh.percent === 0 && fresh.remaining === 300 && !fresh.overLimit);

const mid = usageFor({ plan: 'starter', monthly_minutes_included: 300, minutes_used_this_month: 145 });
ok('145/300 is 48%', mid.percent === 48, String(mid.percent));
ok('155 minutes left', mid.remaining === 155, String(mid.remaining));
ok('no overage under the allowance', mid.overageCost === 0 && mid.monthCost === 49, JSON.stringify(mid));

const over = usageFor({ plan: 'starter', monthly_minutes_included: 300, minutes_used_this_month: 350 });
ok('50 minutes over', over.overageMinutes === 50, String(over.overageMinutes));
ok('50 x $0.35 = $17.50', near(over.overageCost, 17.5), String(over.overageCost));
ok('month costs $49 + $17.50', near(over.monthCost, 66.5), String(over.monthCost));
ok('percent caps at 100', over.percent === 100, String(over.percent));

const proOver = usageFor({ plan: 'pro', monthly_minutes_included: 1000, minutes_used_this_month: 1200, overage_rate: 0.28 });
ok('pro overage uses its own rate', near(proOver.overageCost, 56), String(proOver.overageCost));

ok('a tenant allowance beats the plan default',
  usageFor({ plan: 'starter', monthly_minutes_included: 900, minutes_used_this_month: 450 }).percent === 50);
ok('missing fields do not throw', usageFor(null).included === 300);
ok('negative usage is floored', usageFor({ plan: 'starter', minutes_used_this_month: -5 }).used === 0);

console.log('\nmargin — the reason this change exists');
const beStarter = breakEvenMinutes(PLANS[0]);
const bePro = breakEvenMinutes(PLANS[1]);
ok('starter break-even is ~161 min', beStarter === Math.round(49 / COST_PER_MINUTE), String(beStarter));
ok('pro break-even is ~490 min', bePro === Math.round(149 / COST_PER_MINUTE), String(bePro));
/* Recorded, not asserted as good: Pro and Enterprise price overage below
   cost, so those minutes lose money instead of recovering it. That is the
   pricing as specified — this test exists so a change to it is deliberate. */
const belowCost = PLANS.filter((p) => p.overageRate < COST_PER_MINUTE).map((p) => p.id);
ok('starter overage is above cost', PLANS[0].overageRate > COST_PER_MINUTE);
ok('pro and enterprise overage are knowingly below cost',
  belowCost.join(',') === 'pro,enterprise', belowCost.join(','));
console.log(`       note: cost is $${COST_PER_MINUTE}/min; ` +
  PLANS.map((p) => `${p.id} overage $${p.overageRate} (${p.overageRate > COST_PER_MINUTE ? '+' : '−'}$${Math.abs(p.overageRate - COST_PER_MINUTE).toFixed(3)}/min)`).join(', '));
ok('enterprise is quoted, not listed', breakEvenMinutes(PLANS[2]) === null);

/* The old model, for the record: 500 calls at ~3 min each. */
const oldLoss = 49 - 500 * 3 * COST_PER_MINUTE;
ok('the old 500-call plan lost about $407', Math.round(oldLoss) === -407, String(Math.round(oldLoss)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
