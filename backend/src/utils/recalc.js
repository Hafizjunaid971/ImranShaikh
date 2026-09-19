/**
 * RECALCULATION SERVICE
 * ---------------------------------------------------------------------------
 * Excel میں E4 = پچھلے دن کا I4 تھا۔ یعنی کسی ایک دن کا وزن/ریٹ/ریکوری بدلے تو
 * اُس کے بعد کے *تمام* دنوں کے بقایہ خود بخود بدلنے چاہئیں۔ یہ فائل وہی زنجیر
 * چلاتی ہے — کسی بھی شیٹ کے محفوظ ہونے پر بعد کی ساری شیٹیں دوبارہ حساب ہوتی ہیں۔
 */
'use strict';

const DailySheet = require('../models/DailySheet');
const { Customer } = require('../models/Master');
const { BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const F = require('./formulas');

const dayStart = (d) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

/**
 * کسی گاہک کا اُس تاریخ سے *پہلے* کا آخری بقایہ نکالتا ہے۔
 * کوئی پچھلی شیٹ نہ ہو تو گاہک کا اوپننگ بیلنس۔
 */
async function previousClosingFor(customerId, date) {
  const prev = await DailySheet.findOne(
    { date: { $lt: dayStart(date) }, 'entries.customer': customerId },
    { entries: { $elemMatch: { customer: customerId } }, date: 1 }
  )
    .sort({ date: -1 })
    .lean();

  if (prev && prev.entries && prev.entries[0]) return F.num(prev.entries[0].closingBalance);

  const c = await Customer.findById(customerId).lean();
  return c ? F.num(c.openingBalance) : 0;
}

/**
 * ایک شیٹ کا مکمل حساب: پہلے ہر لائن کا previousBalance زنجیر سے بھرتا ہے،
 * پھر formulas.js سے سارے فارمولے چلاتا ہے۔
 */
async function recomputeSheet(sheetDoc, { fillPrevious = true } = {}) {
  if (fillPrevious) {
    for (const e of sheetDoc.entries) {
      e.previousBalance = await previousClosingFor(e.customer, sheetDoc.date);
    }
  }

  const computed = F.computeDailySheet({
    entries: sheetDoc.entries.map((e) => ({
      loads: e.loads,
      weight: e.weight,
      rate: e.rate,
      previousBalance: e.previousBalance,
      recoveries: e.recoveries,
    })),
    purchases: sheetDoc.purchases.map((p) => ({ weight: p.weight, rate: p.rate })),
    expenses: sheetDoc.expenses.map((x) => ({ amount: x.amount })),
    costing: {
      baseRate: sheetDoc.costing ? sheetDoc.costing.baseRate : 0,
      shortWeight: sheetDoc.costing ? sheetDoc.costing.shortWeight : null,
      manualShortValue: sheetDoc.costing ? sheetDoc.costing.manualShortValue : null,
    },
  });

  computed.entries.forEach((c, i) => {
    const e = sheetDoc.entries[i];
    e.weight = c.weight;
    e.rate = c.rate;
    e.amount = c.amount;
    e.previousBalance = c.previousBalance;
    e.totalAmount = c.totalAmount;
    e.recovery = c.recovery;
    e.closingBalance = c.closingBalance;
  });

  computed.purchases.forEach((c, i) => {
    sheetDoc.purchases[i].amount = c.amount;
  });

  sheetDoc.totals = computed.totals;
  sheetDoc.costing = {
    ...(sheetDoc.costing || {}),
    baseRate: computed.costing.baseRate,
    shortWeight: computed.costing.shortWeight,
    manualShortValue: sheetDoc.costing ? sheetDoc.costing.manualShortValue : null,
    shortValue: computed.costing.shortValue,
    totalCosting: computed.costing.totalCosting,
    perKg: computed.costing.perKg,
    costingRate: computed.costing.costingRate,
  };

  return sheetDoc;
}

/**
 * دی گئی تاریخ کے بعد کی تمام شیٹوں کو دوبارہ حساب کرتا ہے (زنجیر)۔
 * @returns {number} کتنی شیٹیں اپڈیٹ ہوئیں
 */
async function cascadeFrom(date) {
  const later = await DailySheet.find({ date: { $gt: dayStart(date) } }).sort({ date: 1 });
  for (const s of later) {
    await recomputeSheet(s, { fillPrevious: true });
    await s.save();
  }
  return later.length;
}

/** بینک لیجر کے running balance دوبارہ لکھتا ہے */
async function recalcBank(accountId, openingBalance) {
  const rows = await BankTransaction.find({ account: accountId }).sort({ date: 1, serial: 1, createdAt: 1 });
  let bal = F.num(openingBalance);
  const ops = rows.map((r) => {
    bal = F.round(bal + F.num(r.deposit) - F.num(r.withdraw));
    return { updateOne: { filter: { _id: r._id }, update: { $set: { balance: bal } } } };
  });
  if (ops.length) await BankTransaction.bulkWrite(ops);
  return bal;
}

/** سپلائر لیجر کی زنجیر: previousBalance → total → balance */
async function recalcSupplier(supplierId, openingBalance) {
  const rows = await SupplierTransaction.find({ supplier: supplierId }).sort({ date: 1, createdAt: 1 });
  let prev = F.num(openingBalance);
  const ops = rows.map((r) => {
    const amount = F.round(F.num(r.weight) * F.num(r.rate));
    const total = F.round(amount + prev);
    const balance = F.round(total - F.num(r.paid));
    const set = { amount, previousBalance: prev, total, balance };
    prev = balance;
    return { updateOne: { filter: { _id: r._id }, update: { $set: set } } };
  });
  if (ops.length) await SupplierTransaction.bulkWrite(ops);
  return prev;
}

/** پارٹی لیجر کی زنجیر: balance = prev + debit - credit */
async function recalcParty(party, openingBalance = 0) {
  const rows = await PartyLedger.find({ party }).sort({ date: 1, serial: 1, createdAt: 1 });
  let bal = F.num(openingBalance);
  const ops = rows.map((r) => {
    const d = F.num(r.debit);
    const c = F.num(r.credit);
    if (!(d === 0 && c === 0)) bal = F.round(bal + d - c);
    return { updateOne: { filter: { _id: r._id }, update: { $set: { balance: bal } } } };
  });
  if (ops.length) await PartyLedger.bulkWrite(ops);
  return bal;
}

module.exports = {
  dayStart,
  previousClosingFor,
  recomputeSheet,
  cascadeFrom,
  recalcBank,
  recalcSupplier,
  recalcParty,
};
