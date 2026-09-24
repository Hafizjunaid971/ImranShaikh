'use strict';
const DailySheet = require('../models/DailySheet');
const { Customer, Supplier, ExpenseHead } = require('../models/Master');
const { SupplierTransaction, BankTransaction, BankAccount } = require('../models/Ledgers');
const { asyncH, AppError } = require('../middleware');
const { dayStart, recomputeSheet, cascadeFrom, previousClosingFor, recalcSupplier, recalcBank } = require('../utils/recalc');
const F = require('../utils/formulas');

/* --------------------------------------------------------------- LIST ---- */

exports.list = asyncH(async (req, res) => {
  const { from, to, limit = 60 } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = dayStart(from);
    if (to) filter.date.$lte = dayStart(to);
  }
  const sheets = await DailySheet.find(filter, { entries: 0, purchases: 0, expenses: 0 })
    .sort({ date: -1 })
    .limit(Number(limit))
    .lean();
  res.json({ ok: true, data: sheets });
});

/* ---------------------------------------------------------------- GET ---- */
/**
 * GET /api/daily/:date
 * شیٹ موجود ہو تو وہی، ورنہ ایک خالی ٹیمپلیٹ بنا کر دیتا ہے جس میں ہر گاہک کا
 * پچھلا بقایہ پہلے سے بھرا ہوتا ہے (Excel کا E کالم)۔
 */
exports.getByDate = asyncH(async (req, res) => {
  const date = dayStart(req.params.date);
  let sheet = await DailySheet.findOne({ date })
    .populate('entries.customer', 'name area phone')
    .populate('purchases.supplier', 'name kind city')
    .lean();

  if (sheet) return res.json({ ok: true, data: sheet, isNew: false });

  // ---- خالی ٹیمپلیٹ ----
  const customers = await Customer.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  const entries = [];
  for (const c of customers) {
    entries.push({
      customer: { _id: c._id, name: c.name, area: c.area, phone: c.phone },
      customerName: c.name,
      sortOrder: c.sortOrder,
      loads: [],
      weight: 0,
      rate: 0,
      recoveries: [],
      amount: 0,
      previousBalance: await previousClosingFor(c._id, date),
      totalAmount: 0,
      recovery: 0,
      closingBalance: 0,
    });
  }
  entries.forEach((e) => {
    e.totalAmount = e.previousBalance;
    e.closingBalance = e.previousBalance;
  });

  const heads = await ExpenseHead.find({ isActive: true, isDaily: true }).sort({ sortOrder: 1 }).lean();
  const suppliers = await Supplier.find({ isActive: true, showInDailySheet: true })
    .sort({ sortOrder: 1 })
    .lean();

  const template = F.computeDailySheet({
    entries: entries.map((e) => ({
      weight: 0,
      rate: 0,
      previousBalance: e.previousBalance,
      recoveries: [],
    })),
    purchases: [],
    expenses: heads.map((h) => ({ amount: h.defaultAmount })),
  });

  res.json({
    ok: true,
    isNew: true,
    data: {
      date,
      title: 'DAILY SHEET',
      entries,
      purchases: suppliers.map((s) => ({
        supplier: { _id: s._id, name: s.name },
        supplierName: s.name,
        vehicleNo: s.vehicleNo || '',
        weight: 0,
        rate: 0,
        amount: 0,
      })),
      expenses: heads.map((h) => ({
        head: h._id,
        headName: h.name,
        amount: h.defaultAmount || 0,
      })),
      costing: { baseRate: 0, shortWeight: null, manualShortValue: null },
      totals: template.totals,
      isLocked: false,
    },
  });
});

/* --------------------------------------------------------------- SAVE ---- */
/**
 * POST /api/daily
 * پوری شیٹ محفوظ کرتا ہے۔ کلائنٹ صرف INPUT بھیجتا ہے (وزن، ریٹ، ریکوری،
 * خرید، خرچے)۔ باقی سب backend حساب کرتا ہے، پھر بعد کے دنوں کی زنجیر چلتی ہے۔
 */
exports.save = asyncH(async (req, res) => {
  const date = dayStart(req.body.date);
  if (Number.isNaN(date.getTime())) throw new AppError('تاریخ درست نہیں', 400);

  let sheet = await DailySheet.findOne({ date });
  if (sheet && sheet.isLocked) throw new AppError('یہ شیٹ بند (lock) ہے، پہلے کھولیں', 423);
  if (!sheet) sheet = new DailySheet({ date, createdBy: req.user._id });

  /* --- گاہک کی لائنیں --- */
  const incoming = Array.isArray(req.body.entries) ? req.body.entries : [];
  const customerIds = incoming.map((e) => e.customer).filter(Boolean);
  const customers = await Customer.find({ _id: { $in: customerIds } }).lean();
  const cMap = new Map(customers.map((c) => [String(c._id), c]));

  sheet.entries = incoming.map((e) => {
    const c = cMap.get(String(e.customer));
    if (!c) throw new AppError(`گاہک نہیں ملا: ${e.customer}`, 400);
    return {
      customer: c._id,
      customerName: c.name,
      sortOrder: c.sortOrder,
      loads: (e.loads || [])
        .filter((l) => F.num(l.weight) !== 0)
        .map((l) => ({ weight: F.num(l.weight), vehicleNo: l.vehicleNo, note: l.note })),
      weight: F.num(e.weight),
      rate: F.num(e.rate),
      recoveries: (e.recoveries || [])
        .filter((r) => F.num(r.amount) !== 0)
        .map((r) => ({
          amount: F.num(r.amount),
          mode: r.mode || 'cash',
          bankAccount: r.bankAccount || undefined,
          note: r.note,
        })),
      note: e.note,
    };
  });

  /* --- خرید / سپلائی --- */
  const supIds = (req.body.purchases || []).map((p) => p.supplier).filter(Boolean);
  const sups = await Supplier.find({ _id: { $in: supIds } }).lean();
  const sMap = new Map(sups.map((s) => [String(s._id), s]));

  sheet.purchases = (req.body.purchases || []).map((p) => {
    const s = sMap.get(String(p.supplier));
    return {
      supplier: s ? s._id : undefined,
      supplierName: s ? s.name : p.supplierName || '',
      vehicleNo: p.vehicleNo || (s ? s.vehicleNo : ''),
      weight: F.num(p.weight),
      rate: F.num(p.rate),
      note: p.note,
    };
  });

  /* --- خرچے --- */
  sheet.expenses = (req.body.expenses || []).map((x) => ({
    head: x.head || undefined,
    headName: x.headName || '',
    amount: F.num(x.amount),
    note: x.note,
  }));

  /* --- کوسٹنگ inputs --- */
  sheet.costing = {
    baseRate: F.num(req.body.costing?.baseRate),
    shortWeight:
      req.body.costing?.shortWeight === undefined || req.body.costing?.shortWeight === null
        ? null
        : F.num(req.body.costing.shortWeight),
    manualShortValue:
      req.body.costing?.manualShortValue === undefined || req.body.costing?.manualShortValue === null
        ? null
        : F.num(req.body.costing.manualShortValue),
  };

  sheet.updatedBy = req.user._id;

  await recomputeSheet(sheet, { fillPrevious: true });
  await sheet.save();

  const affected = await cascadeFrom(date);

  const saved = await DailySheet.findById(sheet._id)
    .populate('entries.customer', 'name area')
    .populate('purchases.supplier', 'name')
    .lean();

  res.json({
    ok: true,
    message: `شیٹ محفوظ ہو گئی${affected ? ` — بعد کی ${affected} شیٹیں بھی اپڈیٹ ہوئیں` : ''}`,
    data: saved,
    cascadedSheets: affected,
  });
});

/* --------------------------------------------------------- LOCK/UNLOCK --- */

exports.setLock = asyncH(async (req, res) => {
  const date = dayStart(req.params.date);
  const sheet = await DailySheet.findOneAndUpdate(
    { date },
    { $set: { isLocked: !!req.body.isLocked, updatedBy: req.user._id } },
    { new: true }
  );
  if (!sheet) throw new AppError('شیٹ نہیں ملی', 404);
  res.json({
    ok: true,
    message: sheet.isLocked ? 'شیٹ بند کر دی گئی' : 'شیٹ کھول دی گئی',
    data: { date: sheet.date, isLocked: sheet.isLocked },
  });
});

/* ------------------------------------------------------------- DELETE ---- */

exports.remove = asyncH(async (req, res) => {
  const date = dayStart(req.params.date);
  const sheet = await DailySheet.findOne({ date });
  if (!sheet) throw new AppError('شیٹ نہیں ملی', 404);
  if (sheet.isLocked) throw new AppError('بند شیٹ حذف نہیں ہو سکتی', 423);

  await SupplierTransaction.deleteMany({ sourceSheet: sheet._id });
  await BankTransaction.deleteMany({ sourceSheet: sheet._id });
  await sheet.deleteOne();
  const affected = await cascadeFrom(date);

  res.json({ ok: true, message: 'شیٹ حذف ہو گئی', cascadedSheets: affected });
});

/* ------------------------------------------------- POST TO LEDGERS ------- */
/**
 * POST /api/daily/:date/post
 * شیٹ کی خرید → سپلائر لیجر، اور بینک والی ریکوری → بینک لیجر میں منتقل کرتا ہے۔
 * دوبارہ چلانے پر پرانے اندراج ہٹا کر نئے بنتے ہیں (idempotent)۔
 */
exports.postToLedgers = asyncH(async (req, res) => {
  const date = dayStart(req.params.date);
  const sheet = await DailySheet.findOne({ date });
  if (!sheet) throw new AppError('شیٹ نہیں ملی', 404);

  await SupplierTransaction.deleteMany({ sourceSheet: sheet._id });
  await BankTransaction.deleteMany({ sourceSheet: sheet._id });

  /* سپلائر لیجر */
  const supplierIds = new Set();
  const supTxns = sheet.purchases
    .filter((p) => p.supplier && (F.num(p.weight) > 0 || F.num(p.rate) > 0))
    .map((p) => {
      supplierIds.add(String(p.supplier));
      return {
        supplier: p.supplier,
        date,
        vehicleNo: p.vehicleNo,
        weight: F.num(p.weight),
        rate: F.num(p.rate),
        paid: 0,
        description: `روزانہ شیٹ ${date.toISOString().slice(0, 10)} سے خرید`,
        sourceSheet: sheet._id,
        createdBy: req.user._id,
      };
    });
  if (supTxns.length) await SupplierTransaction.insertMany(supTxns);

  for (const id of supplierIds) {
    const s = await Supplier.findById(id).lean();
    await recalcSupplier(id, s ? s.openingBalance : 0);
  }

  /* بینک لیجر — صرف وہ ریکوری جو بینک میں جمع ہوئی */
  const bankRows = [];
  const accIds = new Set();
  sheet.entries.forEach((e) => {
    (e.recoveries || []).forEach((r) => {
      if (r.mode === 'bank' && r.bankAccount && F.num(r.amount) > 0) {
        accIds.add(String(r.bankAccount));
        bankRows.push({
          account: r.bankAccount,
          date,
          reference: r.note || `${e.customerName} کے آۓ`,
          deposit: F.num(r.amount),
          withdraw: 0,
          linkedCustomer: e.customer,
          sourceSheet: sheet._id,
          createdBy: req.user._id,
        });
      }
    });
  });
  if (bankRows.length) await BankTransaction.insertMany(bankRows);

  for (const id of accIds) {
    const a = await BankAccount.findById(id).lean();
    await recalcBank(id, a ? a.openingBalance : 0);
  }

  res.json({
    ok: true,
    message: 'لیجر میں منتقل ہو گیا',
    supplierEntries: supTxns.length,
    bankEntries: bankRows.length,
  });
});

/* ------------------------------------------------------------ PREVIEW ---- */
/**
 * POST /api/daily/preview
 * محفوظ کیے بغیر فارمولے چلا کر نتیجہ دکھاتا ہے — فرنٹ اینڈ لائیو ٹوٹل کے لیے
 * یہی کال کرتا ہے تاکہ حساب صرف اور صرف backend میں رہے۔
 */
exports.preview = asyncH(async (req, res) => {
  const computed = F.computeDailySheet({
    entries: (req.body.entries || []).map((e) => ({
      loads: e.loads || [],
      weight: e.weight,
      rate: e.rate,
      previousBalance: e.previousBalance,
      recoveries: e.recoveries || [],
    })),
    purchases: req.body.purchases || [],
    expenses: req.body.expenses || [],
    costing: req.body.costing || {},
  });
  res.json({ ok: true, data: computed });
});
