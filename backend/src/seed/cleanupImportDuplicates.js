/**
 * CLEANUP — Excel امپورٹ سے دوگنی ہو جانے والی لیجر لائنیں ہٹاتا ہے
 * ---------------------------------------------------------------------------
 * Excel فائل کو «سچ» مان کر: ہر (تاریخ + رقم) کے لیے اگر ڈیٹابیس میں Excel سے
 * زیادہ لائنیں ہیں تو سب سے نئی (آخر میں بنی) فالتو لائنیں ہٹا دیتا ہے، پرانی رہتی ہیں۔
 * جو (تاریخ + رقم) Excel میں ہے ہی نہیں، اسے چھوتا نہیں۔
 *
 *   node src/seed/cleanupImportDuplicates.js "<xlsx کا راستہ>"            ← صرف دکھاتا ہے (کچھ نہیں ہٹتا)
 *   node src/seed/cleanupImportDuplicates.js "<xlsx کا راستہ>" --apply    ← واقعی ہٹاتا ہے
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Supplier } = require('../models/Master');
const { BankAccount, BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const { recalcBank, recalcSupplier, recalcParty } = require('../utils/recalc');
const F = require('../utils/formulas');
const X = require('../utils/excelImport');

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
const day = (v) => new Date(v).toISOString().slice(0, 10);
const a = (v) => F.round(F.num(v));

const KEYS = {
  bank: (r) => JSON.stringify([day(r.date), a(r.deposit), a(r.withdraw)]),
  party: (r) => JSON.stringify([day(r.date), a(r.saleAmount), a(r.recoveryAmount), a(r.debit), a(r.credit)]),
  supplier: (r) => JSON.stringify([day(r.date), F.round(F.num(r.weight), 3), a(r.rate), a(r.paid)]),
};

/** ڈیٹابیس کی کون سی لائنیں فالتو ہیں */
function extras(fileRows, dbRows, keyFn) {
  const want = new Map();
  fileRows.forEach((r) => want.set(keyFn(r), (want.get(keyFn(r)) || 0) + 1));
  const groups = new Map();
  dbRows.forEach((r) => {
    const k = keyFn(r);
    if (want.has(k)) groups.set(k, [...(groups.get(k) || []), r]);
  });
  const out = [];
  for (const [k, rows] of groups) {
    const over = rows.length - want.get(k);
    if (over > 0) {
      rows.sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt) || String(x._id).localeCompare(String(y._id)));
      out.push(...rows.slice(rows.length - over));
    }
  }
  return out;
}

async function run() {
  if (!file || !fs.existsSync(file)) throw new Error('Excel فائل کا راستہ دیں');
  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');
  const parsed = await X.parseWorkbookBuffer(fs.readFileSync(file));
  console.log(APPLY ? '⚠️  APPLY موڈ — لائنیں واقعی ہٹیں گی\n' : '👀 صرف جائزہ (کچھ نہیں ہٹے گا) — ہٹانے کے لیے آخر میں --apply لگائیں\n');

  for (const l of parsed.ledgers) {
    let model, filter, keyFn, recalc, label;
    if (l.kind === 'bank') {
      const acc = (await BankAccount.find().lean()).find((b) => String(b.accountNo).replace(/\s/g, '') === String(l.accountNo).replace(/\s/g, ''));
      if (!acc) { console.log(`— ${l.sheetName}: اکاؤنٹ نہیں ملا`); continue; }
      model = BankTransaction; filter = { account: acc._id }; keyFn = KEYS.bank; label = acc.title;
      recalc = () => recalcBank(acc._id, acc.openingBalance);
    } else if (l.kind === 'party') {
      const parties = await PartyLedger.distinct('party');
      const name = parties.find((p) => X.compactKey(p) === X.compactKey(l.party)) || l.party;
      model = PartyLedger; filter = { party: name }; keyFn = KEYS.party; label = name;
      recalc = () => recalcParty(name, 0);
    } else {
      const sup = (await Supplier.find().lean()).find((s) => [X.compactKey(l.supplierName), X.compactKey(l.sheetNameGuess)].includes(X.compactKey(s.name)));
      if (!sup) { console.log(`— ${l.sheetName}: سپلائر نہیں ملا`); continue; }
      model = SupplierTransaction; filter = { supplier: sup._id }; keyFn = KEYS.supplier; label = sup.name;
      recalc = () => recalcSupplier(sup._id, sup.openingBalance);
    }

    const dbRows = await model.find(filter).lean();
    const dead = extras(l.rows, dbRows, keyFn);
    console.log(`${l.kind.padEnd(8)} ${label}: ڈیٹابیس ${dbRows.length} لائنیں، فالتو ${dead.length}`);
    dead.slice(0, 5).forEach((r) => console.log(`     ${day(r.date)}  ${(r.reference || r.description || '').slice(0, 50)}`));

    if (APPLY && dead.length) {
      await model.deleteMany({ _id: { $in: dead.map((r) => r._id) } });
      const bal = await recalc();
      const ok = typeof l.excelFinal !== 'number' || Math.abs(bal - l.excelFinal) <= 1;
      console.log(`     ✅ ہٹائیں — اب بقایہ ${F.round(bal)} / Excel ${l.excelFinal === null ? '-' : F.round(l.excelFinal)} ${ok ? '(مل گیا)' : '(پھر بھی فرق ہے)'}`);
    }
  }
  await mongoose.disconnect();
}

if (require.main === module) run().catch((e) => { console.error('❌', e.message); process.exit(1); });
module.exports = { extras, KEYS };
