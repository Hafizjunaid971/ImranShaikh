/**
 * VERIFY — formulas.js کے نتائج کو اصل Excel فائل کے نتائج سے ملاتا ہے۔
 * ڈیٹابیس کی ضرورت نہیں۔  چلائیں:  npm run verify
 *
 * seedData.json میں ہر دن کے ساتھ `excelTotals` محفوظ ہیں — یہ خود Excel نے
 * حساب کیے تھے۔ اگر ہمارا انجن ان سے ملتا ہے تو فارمولے 100% درست ہیں۔
 */
'use strict';
const F = require('../utils/formulas');
const data = require('./seedData.json');

const TOL = 0.05; // پیسوں کی گول کرنے کی گنجائش
let pass = 0;
let fail = 0;

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 });

function check(label, got, want) {
  const ok = Math.abs(F.num(got) - F.num(want)) <= TOL;
  ok ? pass++ : fail++;
  const mark = ok ? '✅' : '❌';
  console.log(`   ${mark} ${label.padEnd(26)} ہمارا: ${fmt(got).padStart(16)}   Excel: ${fmt(want).padStart(16)}`);
}

// گاہک کے اوپننگ بیلنس کی زنجیر
const opening = new Map(data.customers.map((c) => [c.name, c.openingBalance]));

console.log('\n══════ فارمولا تصدیق — Excel بمقابلہ backend ══════\n');

for (const sheet of data.sheets) {
  console.log(`📅 ${sheet.date}`);

  const entries = sheet.entries.map((e) => ({
    loads: e.loads,
    weight: e.weight,
    rate: e.rate,
    previousBalance: opening.get(e.name) || 0,
    recoveries: (e.recoveries || []).map((a) => ({ amount: a })),
  }));

  const result = F.computeDailySheet({
    entries,
    purchases: sheet.purchases,
    expenses: (sheet.expenses || []).map((a) => ({ amount: a })),
    costing: sheet.costing || {
      baseRate: [...sheet.purchases].sort((a, b) => b.weight - a.weight)[0]?.rate || 0,
    },
  });

  const x = sheet.excelTotals;
  check('کل وزن (B67)', result.totals.weight, x.weight);
  check('کل رقم (D67)', result.totals.amount, x.amount);
  check('اوسط ریٹ (C67)', result.totals.avgRate, x.avgRate);
  check('پچھلا بقایہ (E67)', result.totals.previousBalance, x.prev);
  check('ٹوٹل رقم (F67)', result.totals.totalAmount, x.total);
  check('ریکوری (H67)', result.totals.recovery, x.recovery);
  check('نیا بقایہ (I67)', result.totals.closingBalance, x.closing);
  check('کل خرید (A78)', result.totals.purchaseAmount, x.purchaseAmount);
  check('ایکسسز/شارٹ (D77)', result.totals.excessShort, x.excessShort);
  check('بچت (A81)', result.totals.grossProfit, x.gross);
  check('خرچا (A82)', result.totals.expenseTotal, x.expense);
  check('صافی بچت (A83)', result.totals.netProfit, x.net);
  check('فی کلو کوسٹنگ (G75)', result.costing.perKg, x.costingPerKg);
  check('کوسٹنگ ریٹ (G76)', result.costing.costingRate, x.costingRate);

  // اگلے دن کے لیے بقایہ آگے بڑھائیں
  result.entries.forEach((c, i) => opening.set(sheet.entries[i].name, c.closingBalance));
  console.log('');
}

console.log('═══════════════════════════════════════════════════');
console.log(`   ✅ کامیاب: ${pass}    ❌ ناکام: ${fail}`);
console.log('═══════════════════════════════════════════════════\n');

process.exit(fail === 0 ? 0 : 1);
