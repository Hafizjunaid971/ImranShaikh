/**
 * ============================================================================
 *  FORMULA ENGINE  —  لیجر کے تمام فارمولے
 * ============================================================================
 *  Excel file: لیجر_ستمبر_2026_کراچی.xlsx
 *
 *  EVERY calculation in this business lives in this one file. Controllers and
 *  the frontend never do arithmetic on money — they call these functions.
 *  Each function below names the exact Excel cell it replaces.
 *
 *  ---------------------------------------------------------------------------
 *  A) DAILY SHEET — customer rows (Excel rows 4..66)
 *  ---------------------------------------------------------------------------
 *   D = B * C                رقم        = وزن × ریٹ
 *   E = previous day I       بقایہ رقم  = پچھلے دن کا کلوزنگ بیلنس
 *   F = D + E                ٹوٹل رقم
 *   H = sum(payments)        ریکوری جمع (Excel: =100000+25000+8000 ...)
 *   I = F - H                بقایہ رقم (نیا)
 *
 *  B) DAILY SHEET — totals row (Excel row 67)
 *   B67 = SUM(B4:B66)   C67 = D67/B67 (اوسط ریٹ)   D67/E67/F67/H67/I67 = SUM
 *
 *  C) DAILY SHEET — purchase / supply block (Excel rows 71..76)
 *   A71..A76 = C * D        (C = ریٹ, D = وزن)
 *   A78      = SUM(A71:B77)  ٹوٹل خرید
 *   D77      = B67 - (D71+..+D76)   ایکسسز/شارٹ  (منفی = شارٹ)
 *
 *  D) DAILY SHEET — profit block (Excel rows 80..83)
 *   A80 = D67                کل فروخت
 *   A81 = A80 - A78          بچت (gross profit)
 *   A82 = sum(expenses)      خرچا
 *   A83 = A81 - A82          صافی بچت (net profit)
 *
 *  E) DAILY SHEET — costing block (Excel G72..G76)
 *   G72 = shortWeight * baseRate     شارٹ وزن کی مالیت
 *   G73 = A82                        دن کا کل خرچا
 *   G74 = G72 + G73                  کل کوسٹنگ رقم
 *   G75 = G74 / B67                  فی کلو خرچہ
 *   G76 = G75 + baseRate             کوسٹنگ ریٹ
 *
 *  F) RUNNING LEDGERS
 *   Party  : balance = prevBalance + debit  - credit
 *   Bank   : balance = prevBalance + deposit - withdraw
 *   Supplier: amount = weight*rate ; total = amount + prevBalance ; bal = total - paid
 * ============================================================================
 */

'use strict';

/** Paisa-safe rounding. Money is rounded to 2, weight to 2, rates to 2. */
const round = (n, dp = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, dp);
  return Math.round((v + Number.EPSILON) * f) / f;
};

/** Safe number coercion — blank / null / "" / NaN all become 0. */
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Divide guarding against a zero denominator (Excel would give #DIV/0!). */
const safeDiv = (a, b) => (num(b) === 0 ? 0 : num(a) / num(b));

const sum = (arr, pick = (x) => x) => arr.reduce((t, x) => t + num(pick(x)), 0);

/* ========================================================================== */
/* A) CUSTOMER ROW                                                            */
/* ========================================================================== */

/** D = B * C  —  رقم = وزن × ریٹ */
const rowAmount = (weight, rate) => round(num(weight) * num(rate));

/** H = sum of the day's payments  —  ریکوری جمع */
const rowRecovery = (recoveries = []) =>
  round(sum(recoveries, (r) => (typeof r === 'object' ? r.amount : r)));

/**
 * B = ایک دن میں ایک سے زیادہ لوڈ کا مجموعہ۔
 * Excel میں یہ «=931.7+222.5» کی صورت لکھا جاتا تھا۔ اگر loads دیے گئے ہوں تو
 * وزن اُن کا مجموعہ ہے، ورنہ سیدھا weight۔
 */
const rowWeight = (loads, weight) => {
  if (Array.isArray(loads) && loads.length) {
    return round(sum(loads, (l) => (typeof l === 'object' ? l.weight : l)));
  }
  return round(num(weight));
};

/**
 * Computes one customer line of the daily sheet.
 * @param {Object} e  { loads:[{weight}], weight, rate, previousBalance, recoveries:[{amount,mode,note}] }
 */
function computeEntry(e = {}) {
  const weight = rowWeight(e.loads, e.weight);
  const rate = round(num(e.rate));
  const amount = rowAmount(weight, rate); // D
  const previousBalance = round(num(e.previousBalance)); // E
  const totalAmount = round(amount + previousBalance); // F
  const recovery = rowRecovery(e.recoveries); // H
  const closingBalance = round(totalAmount - recovery); // I
  return { weight, rate, amount, previousBalance, totalAmount, recovery, closingBalance };
}

/* ========================================================================== */
/* B) SHEET TOTALS (row 67)                                                   */
/* ========================================================================== */

function computeSaleTotals(entries = []) {
  const weight = round(sum(entries, (e) => e.weight));
  const amount = round(sum(entries, (e) => e.amount));
  const previousBalance = round(sum(entries, (e) => e.previousBalance));
  const totalAmount = round(sum(entries, (e) => e.totalAmount));
  const recovery = round(sum(entries, (e) => e.recovery));
  const closingBalance = round(sum(entries, (e) => e.closingBalance));
  return {
    weight,
    amount,
    previousBalance,
    totalAmount,
    recovery,
    closingBalance,
    avgRate: round(safeDiv(amount, weight), 4), // C67 = D67/B67
    activeParties: entries.filter((e) => num(e.weight) > 0 || num(e.recovery) > 0).length,
  };
}

/* ========================================================================== */
/* C) PURCHASE / SUPPLY BLOCK (rows 71..78)                                   */
/* ========================================================================== */

/** A71 = C71 * D71  —  خرید رقم = ریٹ × وزن */
const purchaseAmount = (rate, weight) => round(num(rate) * num(weight));

function computePurchases(purchases = []) {
  const rows = purchases.map((p) => ({
    ...p,
    weight: round(num(p.weight)),
    rate: round(num(p.rate)),
    amount: purchaseAmount(p.rate, p.weight),
  }));
  const weight = round(sum(rows, (p) => p.weight));
  const amount = round(sum(rows, (p) => p.amount)); // A78
  return {
    rows,
    totals: { weight, amount, avgRate: round(safeDiv(amount, weight), 4) },
  };
}

/**
 * D77 = B67 - (sum of purchase weights)
 * منفی = شارٹ ، مثبت = ایکسسز
 */
const excessShort = (saleWeight, purchaseWeight) =>
  round(num(saleWeight) - num(purchaseWeight));

/* ========================================================================== */
/* D) EXPENSES + PROFIT (rows 80..83)                                         */
/* ========================================================================== */

/** A82 = خرچے کا مجموعہ */
const expenseTotal = (expenses = []) =>
  round(sum(expenses, (x) => (typeof x === 'object' ? x.amount : x)));

/** A81 = A80 - A78  —  بچت */
const grossProfit = (saleAmount, purchaseTotal) =>
  round(num(saleAmount) - num(purchaseTotal));

/** A83 = A81 - A82  —  صافی بچت */
const netProfit = (gross, expenses) => round(num(gross) - num(expenses));

/* ========================================================================== */
/* E) COSTING BLOCK (G72..G76)                                                */
/* ========================================================================== */

/**
 * @param {Object} p
 *   baseRate        کوسٹنگ کی بنیادی (سپلائی) ریٹ — G76 میں جو ریٹ جمع ہوتا ہے
 *   shortWeight     شارٹ وزن — یوزر خود دے تو shortValue = shortWeight × baseRate
 *   dayExpense      A82
 *   saleWeight      B67
 *   manualShortValue  اگر یوزر خود شارٹ کی رقم ڈالے (G72 میں ہاتھ سے لکھی جاتی تھی)
 *
 * نوٹ: اصل Excel میں G72 (شارٹ کی مالیت) زیادہ تر خالی ہی رہتا تھا — چاہے اُس دن
 * شارٹ ہوا ہو یا نہیں۔ خالی خانہ ہمیشہ 0 شمار ہوتا ہے (Excel کا SUM بھی خالی کو
 * نظرانداز کرتا ہے)۔ اس لیے یہاں D77 (ایکسسز/شارٹ) سے خودکار قیمت کبھی نہیں
 * نکالی جاتی — صرف وہی چلتا ہے جو یوزر نے خود shortWeight یا manualShortValue
 * میں لکھا ہو۔ دونوں خالی ہوں تو مالیت 0۔
 */
function computeCosting({
  baseRate = 0,
  shortWeight = null,
  excessShortQty = 0,
  dayExpense = 0,
  saleWeight = 0,
  manualShortValue = null,
} = {}) {
  // خالی shortWeight = 0 (D77 سے خودکار اندازہ نہیں لگایا جاتا — Excel میں بھی نہیں لگتا تھا)
  const usedShortWeight = shortWeight === null || shortWeight === '' ? 0 : round(num(shortWeight));

  const shortValue =
    manualShortValue === null || manualShortValue === ''
      ? round(usedShortWeight * num(baseRate)) // G72 — عام طور پر 0، جب تک یوزر شارٹ وزن نہ دے
      : round(num(manualShortValue));

  const totalCosting = round(shortValue + num(dayExpense)); // G74
  const perKg = round(safeDiv(totalCosting, saleWeight), 4); // G75
  const costingRate = round(perKg + num(baseRate), 4); // G76

  return {
    baseRate: round(num(baseRate)),
    shortWeight: usedShortWeight,
    shortValue,
    dayExpense: round(num(dayExpense)),
    totalCosting,
    perKg,
    costingRate,
  };
}

/* ========================================================================== */
/* F) WHOLE DAILY SHEET                                                       */
/* ========================================================================== */

/**
 * Recomputes an entire daily sheet from its raw inputs.
 * Raw inputs = weight, rate, recoveries, previousBalance, purchases, expenses.
 * Everything else in the document is derived here and never trusted from the client.
 */
function computeDailySheet(sheet = {}) {
  const entries = (sheet.entries || []).map((e) => ({
    ...e,
    ...computeEntry(e),
  }));

  const saleTotals = computeSaleTotals(entries);
  const purchase = computePurchases(sheet.purchases || []);
  const expenses = (sheet.expenses || []).map((x) => ({ ...x, amount: round(num(x.amount)) }));
  const expTotal = expenseTotal(expenses);

  const eshort = excessShort(saleTotals.weight, purchase.totals.weight); // D77
  const gross = grossProfit(saleTotals.amount, purchase.totals.amount); // A81
  const net = netProfit(gross, expTotal); // A83

  // بنیادی ریٹ: یوزر نے دیا ہو تو وہی، ورنہ سب سے بڑی خرید کی ریٹ
  const biggest = purchase.rows.slice().sort((a, b) => b.weight - a.weight)[0];
  const baseRate =
    sheet.costing && sheet.costing.baseRate
      ? num(sheet.costing.baseRate)
      : biggest
      ? biggest.rate
      : 0;

  const costing = computeCosting({
    baseRate,
    shortWeight: sheet.costing ? sheet.costing.shortWeight : null,
    manualShortValue: sheet.costing ? sheet.costing.manualShortValue : null,
    excessShortQty: eshort,
    dayExpense: expTotal,
    saleWeight: saleTotals.weight,
  });

  return {
    entries,
    purchases: purchase.rows,
    expenses,
    totals: {
      ...saleTotals,
      purchaseWeight: purchase.totals.weight,
      purchaseAmount: purchase.totals.amount,
      purchaseAvgRate: purchase.totals.avgRate,
      excessShort: eshort,
      excessShortLabel: eshort < 0 ? 'شارٹ' : eshort > 0 ? 'ایکسسز' : 'برابر',
      expenseTotal: expTotal,
      grossProfit: gross,
      netProfit: net,
      profitPerKg: round(safeDiv(net, saleTotals.weight), 4),
    },
    costing,
  };
}

/* ========================================================================== */
/* G) RUNNING LEDGERS                                                         */
/* ========================================================================== */

/**
 * Party / partner ledger (Excel sheet «عمران شیخ»).
 * G = IF(AND(D="",E=""),"", Gprev + D - E)
 * A row with neither debit nor credit leaves the balance blank — we carry it forward.
 */
function runPartyLedger(rows = [], openingBalance = 0) {
  let bal = num(openingBalance);
  return rows.map((r) => {
    const debit = round(num(r.debit));
    const credit = round(num(r.credit));
    const blank = debit === 0 && credit === 0;
    if (!blank) bal = round(bal + debit - credit);
    return { ...r, debit, credit, balance: bal, isBlankRow: blank };
  });
}

/**
 * Bank statement (Excel «بینک الحبیب محمد علی»).
 * F = Fprev + D(جمع) - E(نکالے);  header: D3=SUM, E3=SUM, F3=D3-E3
 */
function runBankLedger(rows = [], openingBalance = 0) {
  let bal = num(openingBalance);
  const out = rows.map((r) => {
    const deposit = round(num(r.deposit));
    const withdraw = round(num(r.withdraw));
    bal = round(bal + deposit - withdraw);
    return { ...r, deposit, withdraw, balance: bal };
  });
  const totalDeposit = round(sum(out, (r) => r.deposit));
  const totalWithdraw = round(sum(out, (r) => r.withdraw));
  return {
    rows: out,
    summary: {
      openingBalance: round(num(openingBalance)),
      totalDeposit,
      totalWithdraw,
      net: round(totalDeposit - totalWithdraw),
      closingBalance: bal,
    },
  };
}

/**
 * Supplier / آڑتی ledger (Excel «عمران ٹنڈوآدم» ، «وحید بلوچ آڑتی»).
 * E = C*D ;  F = previous row's I ;  G = E+F ;  I = G-H
 */
function runSupplierLedger(rows = [], openingBalance = 0) {
  let prev = num(openingBalance);
  const out = rows.map((r) => {
    const weight = round(num(r.weight));
    const rate = round(num(r.rate));
    const amount = round(weight * rate); // E
    const previousBalance = round(prev); // F
    const total = round(amount + previousBalance); // G
    const paid = round(num(r.paid)); // H
    const balance = round(total - paid); // I
    prev = balance;
    return { ...r, weight, rate, amount, previousBalance, total, paid, balance };
  });
  return {
    rows: out,
    summary: {
      openingBalance: round(num(openingBalance)),
      totalWeight: round(sum(out, (r) => r.weight)),
      totalAmount: round(sum(out, (r) => r.amount)),
      totalPaid: round(sum(out, (r) => r.paid)),
      closingBalance: prev,
    },
  };
}

/**
 * Customer ledger built from daily-sheet lines (Excel columns E/F/H/I per day).
 */
function runCustomerLedger(lines = [], openingBalance = 0) {
  let prev = num(openingBalance);
  const out = lines.map((l) => {
    const amount = rowAmount(l.weight, l.rate);
    const previousBalance = round(prev);
    const totalAmount = round(amount + previousBalance);
    const recovery = round(num(l.recovery));
    const closingBalance = round(totalAmount - recovery);
    prev = closingBalance;
    return { ...l, amount, previousBalance, totalAmount, recovery, closingBalance };
  });
  return {
    rows: out,
    summary: {
      openingBalance: round(num(openingBalance)),
      totalWeight: round(sum(out, (r) => r.weight)),
      totalAmount: round(sum(out, (r) => r.amount)),
      totalRecovery: round(sum(out, (r) => r.recovery)),
      closingBalance: prev,
      avgRate: round(safeDiv(sum(out, (r) => r.amount), sum(out, (r) => r.weight)), 4),
    },
  };
}

module.exports = {
  round,
  num,
  safeDiv,
  sum,
  rowAmount,
  rowRecovery,
  rowWeight,
  computeEntry,
  computeSaleTotals,
  purchaseAmount,
  computePurchases,
  excessShort,
  expenseTotal,
  grossProfit,
  netProfit,
  computeCosting,
  computeDailySheet,
  runPartyLedger,
  runBankLedger,
  runSupplierLedger,
  runCustomerLedger,
};
