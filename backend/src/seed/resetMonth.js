/**
 * RESET MONTH — کسی ایک مہینے کا سارا ڈیٹا ہٹاتا ہے (روزانہ شیٹیں + بینک/پارٹی/سپلائر لیجر کی لائنیں)
 * تاکہ اُس مہینے کی Excel دوبارہ صاف امپورٹ ہو سکے۔ دوسرے مہینوں کو نہیں چھوتا۔
 *
 *   node src/seed/resetMonth.js 2026-10            ← صرف گنتی دکھاتا ہے، کچھ نہیں ہٹتا
 *   node src/seed/resetMonth.js 2026-10 --apply    ← واقعی ہٹاتا ہے
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Supplier } = require('../models/Master');
const DailySheet = require('../models/DailySheet');
const { BankAccount, BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const { recalcBank, recalcSupplier, recalcParty, cascadeFrom } = require('../utils/recalc');

const ym = process.argv[2];
const APPLY = process.argv.includes('--apply');

async function run() {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym || '')) throw new Error('مہینہ اس طرح دیں:  2026-10');
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1)); // اگلے مہینے کی پہلی تاریخ (شامل نہیں)
  const range = { $gte: from, $lt: to };

  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');
  const counts = {
    'روزانہ شیٹیں': await DailySheet.countDocuments({ date: range }),
    'بینک لائنیں': await BankTransaction.countDocuments({ date: range }),
    'پارٹی لائنیں': await PartyLedger.countDocuments({ date: range }),
    'سپلائر لائنیں': await SupplierTransaction.countDocuments({ date: range }),
  };
  const later = await DailySheet.countDocuments({ date: { $gte: to } });

  console.log(`\n${ym} کا ڈیٹا (${from.toISOString().slice(0, 10)} سے ${new Date(to - 1).toISOString().slice(0, 10)} تک):`);
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  if (later) console.log(`  (اس کے بعد کے مہینوں کی ${later} شیٹیں ہٹیں گی نہیں، صرف ان کا بقایہ دوبارہ حساب ہوگا)`);

  if (!APPLY) {
    console.log('\n👀 صرف جائزہ — کچھ نہیں ہٹا۔ ہٹانے کے لیے آخر میں --apply لگائیں');
    return mongoose.disconnect();
  }

  await DailySheet.deleteMany({ date: range });
  await BankTransaction.deleteMany({ date: range });
  await PartyLedger.deleteMany({ date: range });
  await SupplierTransaction.deleteMany({ date: range });

  /* باقی لائنوں کے چلتے بقایہ دوبارہ */
  for (const a of await BankAccount.find().lean()) await recalcBank(a._id, a.openingBalance);
  for (const s of await Supplier.find().lean()) await recalcSupplier(s._id, s.openingBalance);
  for (const p of await PartyLedger.distinct('party')) await recalcParty(p, 0);
  if (later) await cascadeFrom(new Date(from.getTime() - 86400000));

  console.log('\n✅ ہٹا دیا گیا۔ اب ویب سائٹ کے «ایکسل امپورٹ» صفحے سے اس مہینے کی Excel اپ لوڈ کریں۔');
  await mongoose.disconnect();
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
