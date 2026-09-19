'use strict';
const DailySheet = require('../models/DailySheet');
const { Customer, Supplier } = require('../models/Master');
const { BankAccount, BankTransaction, SupplierTransaction } = require('../models/Ledgers');
const { asyncH } = require('../middleware');
const { dayStart } = require('../utils/recalc');
const F = require('../utils/formulas');

const monthRange = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  const now = new Date();
  const year = y || now.getUTCFullYear();
  const month = m || now.getUTCMonth() + 1;
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { from, to };
};

/* ==================================================== DASHBOARD ========== */
exports.dashboard = asyncH(async (req, res) => {
  const { from, to } = monthRange(req.query.month);

  const sheets = await DailySheet.find(
    { date: { $gte: from, $lte: to } },
    { entries: 0, purchases: 0, expenses: 0 }
  )
    .sort({ date: 1 })
    .lean();

  const agg = sheets.reduce(
    (t, s) => {
      t.saleWeight += F.num(s.totals.weight);
      t.saleAmount += F.num(s.totals.amount);
      t.recovery += F.num(s.totals.recovery);
      t.purchaseWeight += F.num(s.totals.purchaseWeight);
      t.purchaseAmount += F.num(s.totals.purchaseAmount);
      t.expense += F.num(s.totals.expenseTotal);
      t.grossProfit += F.num(s.totals.grossProfit);
      t.netProfit += F.num(s.totals.netProfit);
      t.excessShort += F.num(s.totals.excessShort);
      return t;
    },
    {
      saleWeight: 0, saleAmount: 0, recovery: 0, purchaseWeight: 0,
      purchaseAmount: 0, expense: 0, grossProfit: 0, netProfit: 0, excessShort: 0,
    }
  );
  Object.keys(agg).forEach((k) => (agg[k] = F.round(agg[k])));
  agg.avgSaleRate = F.round(F.safeDiv(agg.saleAmount, agg.saleWeight), 2);
  agg.avgPurchaseRate = F.round(F.safeDiv(agg.purchaseAmount, agg.purchaseWeight), 2);
  agg.netProfitPerKg = F.round(F.safeDiv(agg.netProfit, agg.saleWeight), 2);
  agg.days = sheets.length;

  const last = await DailySheet.findOne({}, { entries: 0, purchases: 0, expenses: 0 })
    .sort({ date: -1 })
    .lean();

  const outstanding = last ? F.num(last.totals.closingBalance) : 0;

  const accounts = await BankAccount.find({ isActive: true }).lean();
  const bankBalances = [];
  for (const a of accounts) {
    const txns = await BankTransaction.find({ account: a._id }).lean();
    const bal = F.round(
      F.num(a.openingBalance) + txns.reduce((t, r) => t + F.num(r.deposit) - F.num(r.withdraw), 0)
    );
    bankBalances.push({ id: a._id, title: a.title, bankName: a.bankName, balance: bal });
  }

  res.json({
    ok: true,
    period: { from, to, month: req.query.month || `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}` },
    summary: { ...agg, customerOutstanding: outstanding },
    trend: sheets.map((s) => ({
      date: s.date,
      weight: s.totals.weight,
      amount: s.totals.amount,
      recovery: s.totals.recovery,
      netProfit: s.totals.netProfit,
      avgRate: s.totals.avgRate,
      costingRate: s.costing ? s.costing.costingRate : 0,
    })),
    banks: bankBalances,
    lastSheetDate: last ? last.date : null,
  });
});

/* ================================================= PROFIT REPORT ========= */
exports.profitReport = asyncH(async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = dayStart(req.query.from);
    if (req.query.to) filter.date.$lte = dayStart(req.query.to);
  }

  const sheets = await DailySheet.find(filter, { entries: 0 }).sort({ date: 1 }).lean();

  const rows = sheets.map((s) => ({
    date: s.date,
    saleWeight: s.totals.weight,
    saleAmount: s.totals.amount,
    avgRate: s.totals.avgRate,
    purchaseWeight: s.totals.purchaseWeight,
    purchaseAmount: s.totals.purchaseAmount,
    excessShort: s.totals.excessShort,
    grossProfit: s.totals.grossProfit,
    expense: s.totals.expenseTotal,
    netProfit: s.totals.netProfit,
    profitPerKg: s.totals.profitPerKg,
    costingRate: s.costing ? s.costing.costingRate : 0,
  }));

  const t = rows.reduce(
    (a, r) => {
      a.saleWeight += r.saleWeight; a.saleAmount += r.saleAmount;
      a.purchaseWeight += r.purchaseWeight; a.purchaseAmount += r.purchaseAmount;
      a.excessShort += r.excessShort; a.grossProfit += r.grossProfit;
      a.expense += r.expense; a.netProfit += r.netProfit;
      return a;
    },
    { saleWeight: 0, saleAmount: 0, purchaseWeight: 0, purchaseAmount: 0, excessShort: 0, grossProfit: 0, expense: 0, netProfit: 0 }
  );
  Object.keys(t).forEach((k) => (t[k] = F.round(t[k])));
  t.profitPerKg = F.round(F.safeDiv(t.netProfit, t.saleWeight), 4);
  t.avgSaleRate = F.round(F.safeDiv(t.saleAmount, t.saleWeight), 4);

  res.json({ ok: true, rows, totals: t });
});

/* =============================================== RECOVERY REPORT ========= */
exports.recoveryReport = asyncH(async (req, res) => {
  const match = {};
  if (req.query.from || req.query.to) {
    match.date = {};
    if (req.query.from) match.date.$gte = dayStart(req.query.from);
    if (req.query.to) match.date.$lte = dayStart(req.query.to);
  }

  const rows = await DailySheet.aggregate([
    { $match: match },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$entries.customer',
        name: { $first: '$entries.customerName' },
        totalWeight: { $sum: '$entries.weight' },
        totalSale: { $sum: '$entries.amount' },
        totalRecovery: { $sum: '$entries.recovery' },
        lastBalance: { $last: '$entries.closingBalance' },
        days: { $sum: { $cond: [{ $gt: ['$entries.weight', 0] }, 1, 0] } },
      },
    },
    { $sort: { lastBalance: -1 } },
  ]);

  const totals = rows.reduce(
    (t, r) => {
      t.weight += r.totalWeight; t.sale += r.totalSale;
      t.recovery += r.totalRecovery; t.balance += r.lastBalance;
      return t;
    },
    { weight: 0, sale: 0, recovery: 0, balance: 0 }
  );
  Object.keys(totals).forEach((k) => (totals[k] = F.round(totals[k])));

  res.json({ ok: true, rows: rows.map((r) => ({ ...r, customer: r._id })), totals });
});

/* ============================================= EXPENSE BREAKDOWN ========= */
exports.expenseReport = asyncH(async (req, res) => {
  const match = {};
  if (req.query.from || req.query.to) {
    match.date = {};
    if (req.query.from) match.date.$gte = dayStart(req.query.from);
    if (req.query.to) match.date.$lte = dayStart(req.query.to);
  }

  const rows = await DailySheet.aggregate([
    { $match: match },
    { $unwind: '$expenses' },
    {
      $group: {
        _id: '$expenses.headName',
        total: { $sum: '$expenses.amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const total = F.round(rows.reduce((t, r) => t + r.total, 0));
  res.json({
    ok: true,
    rows: rows.map((r) => ({
      head: r._id || 'متفرق',
      total: F.round(r.total),
      count: r.count,
      share: F.round(F.safeDiv(r.total, total) * 100, 2),
    })),
    total,
  });
});

/* ============================================== SUPPLIER SUMMARY ========= */
exports.supplierSummary = asyncH(async (req, res) => {
  const suppliers = await Supplier.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  const out = [];
  for (const s of suppliers) {
    const txns = await SupplierTransaction.find({ supplier: s._id }).lean();
    const weight = F.round(txns.reduce((t, r) => t + F.num(r.weight), 0));
    const amount = F.round(txns.reduce((t, r) => t + F.num(r.weight) * F.num(r.rate), 0));
    const paid = F.round(txns.reduce((t, r) => t + F.num(r.paid), 0));
    out.push({
      id: s._id,
      name: s.name,
      kind: s.kind,
      city: s.city,
      totalWeight: weight,
      totalAmount: amount,
      totalPaid: paid,
      balance: F.round(F.num(s.openingBalance) + amount - paid),
    });
  }
  res.json({ ok: true, data: out });
});

/* ============================================ CUSTOMER STATEMENT ========= */
exports.dayComparison = asyncH(async (req, res) => {
  const sheets = await DailySheet.find({}, { entries: 0, purchases: 0, expenses: 0 })
    .sort({ date: -1 })
    .limit(Number(req.query.limit || 30))
    .lean();

  res.json({
    ok: true,
    data: sheets.reverse().map((s) => ({
      date: s.date,
      saleWeight: s.totals.weight,
      avgRate: s.totals.avgRate,
      costingRate: s.costing ? s.costing.costingRate : 0,
      margin: F.round(F.num(s.totals.avgRate) - F.num(s.costing ? s.costing.costingRate : 0), 2),
      netProfit: s.totals.netProfit,
    })),
  });
});
