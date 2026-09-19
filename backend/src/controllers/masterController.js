'use strict';
const { Customer, Supplier, ExpenseHead, Setting } = require('../models/Master');
const { BankAccount } = require('../models/Ledgers');
const DailySheet = require('../models/DailySheet');
const { asyncH, AppError } = require('../middleware');
const { cascadeFrom, recalcBank } = require('../utils/recalc');
const F = require('../utils/formulas');

/* ----------------------------------------------------------- CUSTOMERS --- */

exports.listCustomers = asyncH(async (req, res) => {
  const { q, active } = req.query;
  const filter = {};
  if (q) filter.name = { $regex: String(q).trim(), $options: 'i' };
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  const customers = await Customer.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

  // ہر گاہک کا تازہ ترین بقایہ بھی ساتھ بھیجیں
  const latest = await DailySheet.aggregate([
    { $sort: { date: -1 } },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$entries.customer',
        closingBalance: { $first: '$entries.closingBalance' },
        lastDate: { $first: '$date' },
      },
    },
  ]);
  const map = new Map(latest.map((x) => [String(x._id), x]));

  res.json({
    ok: true,
    data: customers.map((c) => {
      const l = map.get(String(c._id));
      return {
        ...c,
        currentBalance: l ? l.closingBalance : F.num(c.openingBalance),
        lastActivity: l ? l.lastDate : c.openingDate || null,
      };
    }),
  });
});

exports.createCustomer = asyncH(async (req, res) => {
  const last = await Customer.findOne().sort({ sortOrder: -1 }).lean();
  const doc = await Customer.create({
    ...req.body,
    sortOrder: req.body.sortOrder ?? (last ? last.sortOrder + 1 : 1),
  });
  res.status(201).json({ ok: true, data: doc });
});

exports.updateCustomer = asyncH(async (req, res) => {
  const before = await Customer.findById(req.params.id);
  if (!before) throw new AppError('گاہک نہیں ملا', 404);

  const openingChanged =
    req.body.openingBalance !== undefined &&
    F.num(req.body.openingBalance) !== F.num(before.openingBalance);

  Object.assign(before, req.body);
  await before.save();

  // اوپننگ بیلنس بدلا تو پوری زنجیر دوبارہ چلے
  if (openingChanged) await cascadeFrom(new Date('1970-01-01'));

  res.json({ ok: true, data: before, recalculated: openingChanged });
});

exports.deleteCustomer = asyncH(async (req, res) => {
  const used = await DailySheet.countDocuments({ 'entries.customer': req.params.id });
  if (used > 0) throw new AppError('یہ گاہک شیٹوں میں استعمال ہو چکا ہے — صرف غیر فعال کریں', 409);
  await Customer.findByIdAndDelete(req.params.id);
  res.json({ ok: true, message: 'گاہک حذف ہو گیا' });
});

/* ----------------------------------------------------------- SUPPLIERS --- */

exports.listSuppliers = asyncH(async (req, res) => {
  const filter = {};
  if (req.query.kind) filter.kind = req.query.kind;
  if (req.query.active === 'true') filter.isActive = true;
  const data = await Supplier.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ ok: true, data });
});

exports.createSupplier = asyncH(async (req, res) => {
  const doc = await Supplier.create(req.body);
  res.status(201).json({ ok: true, data: doc });
});

exports.updateSupplier = asyncH(async (req, res) => {
  const doc = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!doc) throw new AppError('سپلائر نہیں ملا', 404);
  res.json({ ok: true, data: doc });
});

/* -------------------------------------------------------- EXPENSE HEAD --- */

exports.listExpenseHeads = asyncH(async (req, res) => {
  const data = await ExpenseHead.find().sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ ok: true, data });
});

exports.createExpenseHead = asyncH(async (req, res) => {
  const doc = await ExpenseHead.create(req.body);
  res.status(201).json({ ok: true, data: doc });
});

exports.updateExpenseHead = asyncH(async (req, res) => {
  const doc = await ExpenseHead.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doc) throw new AppError('خرچے کا مد نہیں ملا', 404);
  res.json({ ok: true, data: doc });
});

/* ------------------------------------------------------- BANK ACCOUNTS --- */

exports.listBankAccounts = asyncH(async (req, res) => {
  const data = await BankAccount.find().sort({ sortOrder: 1 }).lean();
  res.json({ ok: true, data });
});

exports.createBankAccount = asyncH(async (req, res) => {
  const doc = await BankAccount.create(req.body);
  res.status(201).json({ ok: true, data: doc });
});

exports.updateBankAccount = asyncH(async (req, res) => {
  const doc = await BankAccount.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doc) throw new AppError('اکاؤنٹ نہیں ملا', 404);
  await recalcBank(doc._id, doc.openingBalance);
  res.json({ ok: true, data: doc });
});

/* ------------------------------------------------------------ SETTINGS --- */

exports.getSettings = asyncH(async (req, res) => {
  const rows = await Setting.find().lean();
  const obj = {};
  rows.forEach((r) => (obj[r.key] = r.value));
  res.json({ ok: true, data: obj, raw: rows });
});

exports.updateSetting = asyncH(async (req, res) => {
  const { key } = req.params;
  const doc = await Setting.findOneAndUpdate(
    { key },
    { $set: { value: req.body.value, label: req.body.label } },
    { new: true, upsert: true }
  );
  res.json({ ok: true, data: doc });
});
