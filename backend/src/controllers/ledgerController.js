'use strict';
const DailySheet = require('../models/DailySheet');
const { Customer, Supplier } = require('../models/Master');
const { BankAccount, BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const { asyncH, AppError } = require('../middleware');
const { dayStart, recalcBank, recalcSupplier, recalcParty } = require('../utils/recalc');
const F = require('../utils/formulas');

const range = (from, to) => {
  const f = {};
  if (from) f.$gte = dayStart(from);
  if (to) f.$lte = dayStart(to);
  return Object.keys(f).length ? f : null;
};

/* ==================================================== CUSTOMER LEDGER ==== */
/**
 * GET /api/ledger/customer/:id?from&to
 * روزانہ شیٹوں سے گاہک کا کھاتہ بناتا ہے — Excel کے E/F/H/I کالم۔
 */
exports.customerLedger = asyncH(async (req, res) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw new AppError('گاہک نہیں ملا', 404);

  const { from, to } = req.query;
  const dateFilter = range(from, to);

  const match = { 'entries.customer': customer._id };
  if (dateFilter) match.date = dateFilter;

  const sheets = await DailySheet.find(match, {
    date: 1,
    entries: { $elemMatch: { customer: customer._id } },
  })
    .sort({ date: 1 })
    .lean();

  // دورانیے سے پہلے کا بقایہ = اوپننگ
  let opening = F.num(customer.openingBalance);
  if (dateFilter && dateFilter.$gte) {
    const prior = await DailySheet.findOne(
      { date: { $lt: dateFilter.$gte }, 'entries.customer': customer._id },
      { entries: { $elemMatch: { customer: customer._id } } }
    )
      .sort({ date: -1 })
      .lean();
    if (prior && prior.entries[0]) opening = F.num(prior.entries[0].closingBalance);
  }

  const lines = sheets
    .filter((s) => s.entries && s.entries[0])
    .map((s) => ({
      date: s.date,
      weight: s.entries[0].weight,
      rate: s.entries[0].rate,
      recovery: s.entries[0].recovery,
      recoveries: s.entries[0].recoveries,
    }));

  const ledger = F.runCustomerLedger(lines, opening);

  res.json({
    ok: true,
    customer: { id: customer._id, name: customer.name, area: customer.area, phone: customer.phone },
    ...ledger,
  });
});

/** تمام گاہکوں کا بقایہ خلاصہ (Aging / recovery list) */
exports.customerBalances = asyncH(async (req, res) => {
  const upto = req.query.upto ? dayStart(req.query.upto) : null;
  const match = upto ? { date: { $lte: upto } } : {};

  const rows = await DailySheet.aggregate([
    { $match: match },
    { $sort: { date: -1 } },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$entries.customer',
        name: { $first: '$entries.customerName' },
        closingBalance: { $first: '$entries.closingBalance' },
        lastDate: { $first: '$date' },
      },
    },
    { $sort: { closingBalance: -1 } },
  ]);

  const total = rows.reduce((t, r) => t + F.num(r.closingBalance), 0);
  res.json({
    ok: true,
    data: rows,
    summary: { parties: rows.length, totalOutstanding: F.round(total) },
  });
});

/* ==================================================== SUPPLIER LEDGER ==== */

exports.supplierLedger = asyncH(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id).lean();
  if (!supplier) throw new AppError('سپلائر نہیں ملا', 404);

  const filter = { supplier: supplier._id };
  const d = range(req.query.from, req.query.to);
  if (d) filter.date = d;

  const rows = await SupplierTransaction.find(filter).sort({ date: 1, createdAt: 1 }).lean();
  const ledger = F.runSupplierLedger(rows, supplier.openingBalance);

  res.json({
    ok: true,
    supplier: { id: supplier._id, name: supplier.name, kind: supplier.kind, city: supplier.city },
    ...ledger,
  });
});

exports.addSupplierTxn = asyncH(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new AppError('سپلائر نہیں ملا', 404);

  await SupplierTransaction.create({
    supplier: supplier._id,
    date: dayStart(req.body.date),
    vehicleNo: req.body.vehicleNo,
    weight: F.num(req.body.weight),
    rate: F.num(req.body.rate),
    paid: F.num(req.body.paid),
    description: req.body.description,
    paymentMode: req.body.paymentMode || 'none',
    bankAccount: req.body.bankAccount || undefined,
    createdBy: req.user._id,
  });

  const closing = await recalcSupplier(supplier._id, supplier.openingBalance);
  res.status(201).json({ ok: true, message: 'اندراج ہو گیا', closingBalance: closing });
});

exports.updateSupplierTxn = asyncH(async (req, res) => {
  const txn = await SupplierTransaction.findById(req.params.txnId);
  if (!txn) throw new AppError('اندراج نہیں ملا', 404);
  ['vehicleNo', 'description', 'paymentMode'].forEach((k) => {
    if (req.body[k] !== undefined) txn[k] = req.body[k];
  });
  ['weight', 'rate', 'paid'].forEach((k) => {
    if (req.body[k] !== undefined) txn[k] = F.num(req.body[k]);
  });
  if (req.body.date) txn.date = dayStart(req.body.date);
  await txn.save();

  const supplier = await Supplier.findById(txn.supplier).lean();
  const closing = await recalcSupplier(txn.supplier, supplier.openingBalance);
  res.json({ ok: true, message: 'اندراج اپڈیٹ ہو گیا', closingBalance: closing });
});

exports.deleteSupplierTxn = asyncH(async (req, res) => {
  const txn = await SupplierTransaction.findById(req.params.txnId);
  if (!txn) throw new AppError('اندراج نہیں ملا', 404);
  const supplierId = txn.supplier;
  await txn.deleteOne();
  const supplier = await Supplier.findById(supplierId).lean();
  await recalcSupplier(supplierId, supplier ? supplier.openingBalance : 0);
  res.json({ ok: true, message: 'اندراج حذف ہو گیا' });
});

/* ======================================================== BANK LEDGER ==== */

exports.bankLedger = asyncH(async (req, res) => {
  const account = await BankAccount.findById(req.params.id).lean();
  if (!account) throw new AppError('اکاؤنٹ نہیں ملا', 404);

  const filter = { account: account._id };
  const d = range(req.query.from, req.query.to);
  if (d) filter.date = d;

  const rows = await BankTransaction.find(filter).sort({ date: 1, serial: 1, createdAt: 1 }).lean();

  let opening = F.num(account.openingBalance);
  if (d && d.$gte) {
    const prior = await BankTransaction.find({ account: account._id, date: { $lt: d.$gte } }).lean();
    opening = F.round(
      opening + prior.reduce((t, r) => t + F.num(r.deposit) - F.num(r.withdraw), 0)
    );
  }

  const ledger = F.runBankLedger(rows, opening);
  res.json({
    ok: true,
    account: {
      id: account._id,
      title: account.title,
      accountNo: account.accountNo,
      bankName: account.bankName,
      branch: account.branch,
    },
    ...ledger,
  });
});

exports.addBankTxn = asyncH(async (req, res) => {
  const account = await BankAccount.findById(req.params.id);
  if (!account) throw new AppError('اکاؤنٹ نہیں ملا', 404);

  const last = await BankTransaction.findOne({ account: account._id }).sort({ serial: -1 }).lean();

  await BankTransaction.create({
    account: account._id,
    date: dayStart(req.body.date),
    serial: last ? last.serial + 1 : 1,
    reference: req.body.reference,
    deposit: F.num(req.body.deposit),
    withdraw: F.num(req.body.withdraw),
    linkedCustomer: req.body.linkedCustomer || undefined,
    linkedSupplier: req.body.linkedSupplier || undefined,
    createdBy: req.user._id,
  });

  const closing = await recalcBank(account._id, account.openingBalance);
  res.status(201).json({ ok: true, message: 'بینک اندراج ہو گیا', closingBalance: closing });
});

exports.updateBankTxn = asyncH(async (req, res) => {
  const txn = await BankTransaction.findById(req.params.txnId);
  if (!txn) throw new AppError('اندراج نہیں ملا', 404);
  if (req.body.date) txn.date = dayStart(req.body.date);
  if (req.body.reference !== undefined) txn.reference = req.body.reference;
  if (req.body.deposit !== undefined) txn.deposit = F.num(req.body.deposit);
  if (req.body.withdraw !== undefined) txn.withdraw = F.num(req.body.withdraw);
  await txn.save();
  const account = await BankAccount.findById(txn.account).lean();
  const closing = await recalcBank(txn.account, account.openingBalance);
  res.json({ ok: true, message: 'اندراج اپڈیٹ ہو گیا', closingBalance: closing });
});

exports.deleteBankTxn = asyncH(async (req, res) => {
  const txn = await BankTransaction.findById(req.params.txnId);
  if (!txn) throw new AppError('اندراج نہیں ملا', 404);
  const accId = txn.account;
  await txn.deleteOne();
  const account = await BankAccount.findById(accId).lean();
  await recalcBank(accId, account ? account.openingBalance : 0);
  res.json({ ok: true, message: 'اندراج حذف ہو گیا' });
});

/* ======================================================= PARTY LEDGER ==== */

exports.partyList = asyncH(async (req, res) => {
  const parties = await PartyLedger.distinct('party');
  res.json({ ok: true, data: parties });
});

exports.partyLedger = asyncH(async (req, res) => {
  const party = decodeURIComponent(req.params.party);
  const filter = { party };
  const d = range(req.query.from, req.query.to);
  if (d) filter.date = d;

  const rows = await PartyLedger.find(filter).sort({ date: 1, serial: 1, createdAt: 1 }).lean();

  let opening = 0;
  if (d && d.$gte) {
    const prior = await PartyLedger.find({ party, date: { $lt: d.$gte } }).lean();
    opening = F.round(prior.reduce((t, r) => t + F.num(r.debit) - F.num(r.credit), 0));
  }

  const computed = F.runPartyLedger(rows, opening);
  const totalDebit = F.round(computed.reduce((t, r) => t + r.debit, 0));
  const totalCredit = F.round(computed.reduce((t, r) => t + r.credit, 0));

  res.json({
    ok: true,
    party,
    rows: computed,
    summary: {
      openingBalance: opening,
      totalDebit,
      totalCredit,
      closingBalance: computed.length ? computed[computed.length - 1].balance : opening,
    },
  });
});

exports.addPartyTxn = asyncH(async (req, res) => {
  const party = decodeURIComponent(req.params.party);
  const last = await PartyLedger.findOne({ party }).sort({ serial: -1 }).lean();
  await PartyLedger.create({
    party,
    date: dayStart(req.body.date),
    serial: last ? last.serial + 1 : 1,
    saleAmount: F.num(req.body.saleAmount),
    recoveryAmount: F.num(req.body.recoveryAmount),
    debit: F.num(req.body.debit),
    credit: F.num(req.body.credit),
    reference: req.body.reference,
    createdBy: req.user._id,
  });
  const closing = await recalcParty(party, 0);
  res.status(201).json({ ok: true, message: 'اندراج ہو گیا', closingBalance: closing });
});

exports.updatePartyTxn = asyncH(async (req, res) => {
  const txn = await PartyLedger.findById(req.params.txnId);
  if (!txn) throw new AppError('اندراج نہیں ملا', 404);
  ['reference'].forEach((k) => req.body[k] !== undefined && (txn[k] = req.body[k]));
  ['saleAmount', 'recoveryAmount', 'debit', 'credit'].forEach(
    (k) => req.body[k] !== undefined && (txn[k] = F.num(req.body[k]))
  );
  if (req.body.date) txn.date = dayStart(req.body.date);
  await txn.save();
  const closing = await recalcParty(txn.party, 0);
  res.json({ ok: true, message: 'اندراج اپڈیٹ ہو گیا', closingBalance: closing });
});

exports.deletePartyTxn = asyncH(async (req, res) => {
  const txn = await PartyLedger.findById(req.params.txnId);
  if (!txn) throw new AppError('اندراج نہیں ملا', 404);
  const party = txn.party;
  await txn.deleteOne();
  await recalcParty(party, 0);
  res.json({ ok: true, message: 'اندراج حذف ہو گیا' });
});
