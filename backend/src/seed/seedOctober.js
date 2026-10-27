/**
 * SEED OCTOBER — اکتوبر 2026 کا ڈیٹا (octoberData.json، جو Excel سے بنا ہے) ڈیٹابیس میں ڈالتا ہے۔
 *
 *   node src/seed/seedOctober.js --fresh    ← پہلے اکتوبر کا سارا ڈیٹا ہٹاتا ہے، پھر Excel والا ڈالتا ہے
 *   node src/seed/seedOctober.js            ← ہٹائے بغیر، صرف جو نیا ہے وہ (duplicate نہیں بنتے)
 *
 * --fresh صرف اسی مہینے کی روزانہ شیٹیں اور بینک/پارٹی/سپلائر لائنیں ہٹاتا ہے؛ ستمبر وغیرہ کو نہیں چھوتا۔
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { User, Supplier } = require('../models/Master');
const DailySheet = require('../models/DailySheet');
const { BankAccount, BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const { recalcBank, recalcSupplier, recalcParty } = require('../utils/recalc');
const { __internal: I } = require('../controllers/importController');
const data = require('./octoberData.json');

const FRESH = process.argv.includes('--fresh');

async function run() {
  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');
  const admin = await User.findOne({ role: 'admin' }).lean();
  if (!admin) throw new Error('کوئی admin یوزر نہیں ملا');

  const first = data.daily[0].date; // 2026-10-01
  const [y, m] = first.split('-').map(Number);
  const range = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };

  if (FRESH) {
    const n = {
      sheets: await DailySheet.countDocuments({ date: range }),
      bank: await BankTransaction.countDocuments({ date: range }),
      party: await PartyLedger.countDocuments({ date: range }),
      supplier: await SupplierTransaction.countDocuments({ date: range }),
    };
    console.log(`🧹 ${y}-${String(m).padStart(2, '0')} کا پرانا ڈیٹا ہٹ رہا ہے:`, JSON.stringify(n));
    await DailySheet.deleteMany({ date: range });
    await BankTransaction.deleteMany({ date: range });
    await PartyLedger.deleteMany({ date: range });
    await SupplierTransaction.deleteMany({ date: range });
    for (const a of await BankAccount.find().lean()) await recalcBank(a._id, a.openingBalance);
    for (const s of await Supplier.find().lean()) await recalcSupplier(s._id, s.openingBalance);
    for (const p of await PartyLedger.distinct('party')) await recalcParty(p, 0);
  }

  const plan = await I.buildPlan(data);
  const daily = await I.importDaily(plan, admin, { updateCustomerNames: true });
  console.log(`\n📄 روزانہ شیٹیں بنیں: ${daily.sheetsCreated}   نام اپڈیٹ: ${daily.customersRenamed}   نئے گاہک: ${daily.customersCreated}`);
  if (daily.verify) {
    console.log(
      daily.verify.ok
        ? `   ✅ ${daily.verify.checkedRows} لائنوں کا بقایہ Excel سے بالکل مل گیا`
        : `   ⚠️  ${daily.verify.mismatchedRows}/${daily.verify.checkedRows} لائنوں کا بقایہ Excel سے نہیں ملا: ${JSON.stringify(daily.verify.sheets.slice(0, 3))}`
    );
  }
  daily.notes.forEach((n) => console.log('   •', n));

  console.log('\n📚 لیجر:');
  for (const p of plan.ledgers) {
    const r = await I.applyLedger(p, admin);
    const b = r.balanceCheck;
    console.log(
      `   ${r.kind.padEnd(8)} ${String(r.target || r.sheetName).padEnd(32)} شامل ${r.added}` +
        (r.warning ? `  ⚠️ ${r.warning}` : b ? `   بقایہ ${b.app} / Excel ${b.excel} ${b.ok ? '✅ مل گیا' : '⚠️ فرق ' + b.diff}` : '')
    );
  }
  console.log('\nمکمل۔');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('❌ ناکام:', e);
  process.exit(1);
});
