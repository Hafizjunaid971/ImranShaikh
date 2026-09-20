/**
 * EXCEL EXPORT — منتخب تاریخوں کی روزانہ شیٹس اور چاروں لیجر (پارٹی، بینک،
 * دونوں سپلائر) کو بالکل اُسی فارمیٹ میں ایک .xlsx فائل بنا کر دیتا ہے جیسا
 * اصل Excel فائل میں تھا — زندہ فارمولوں کے ساتھ، تاکہ کھولنے والا خود بھی
 * آگے ترمیم کر سکے اور رقمیں خود دوبارہ حساب ہوں۔
 *
 * اہم: ہر فارمولا خانے کے ساتھ اُس کی کیش شدہ قیمت (result) بھی لکھی جاتی ہے —
 * یہ قیمت ویسے بھی ڈیٹابیس میں پہلے سے محفوظ ہے (backend نے حساب لگا رکھا ہے)۔
 * اس کے بغیر بہت سے ویورز (Excel Online، LibreOffice کا فوری پیش منظر، وغیرہ)
 * فارمولا خانے خالی یا 0 دکھاتے ہیں جب تک خود دوبارہ حساب نہ لگائیں۔ result
 * دینے سے فائل کھلتے ہی صحیح نمبر نظر آتا ہے، اور فارمولا زندہ بھی رہتا ہے —
 * نمبر بدلیں تو Excel خود دوبارہ حساب لگا دے گا۔
 */
'use strict';
const ExcelJS = require('exceljs');
const DailySheet = require('../models/DailySheet');
const { PartyLedger, BankAccount, BankTransaction, SupplierTransaction } = require('../models/Ledgers');
const { Supplier } = require('../models/Master');
const { asyncH, AppError } = require('../middleware');
const { dayStart } = require('../utils/recalc');
const F = require('../utils/formulas');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A3A' } };
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFECE3' } };

/** فارمولا سیل — formula اور اُس کی پہلے سے معلوم قیمت دونوں ایک ساتھ */
const fx = (formula, result) => ({ formula, result: F.num(result) });

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });
}

function setupSheet(wb, name) {
  return wb.addWorksheet(name, { views: [{ rightToLeft: true }] });
}

/* ========================================================================== */
/* ایک دن کی شیٹ                                                             */
/* ========================================================================== */
function buildDailyWorksheet(wb, sheet) {
  const dateStr = new Date(sheet.date).toISOString().slice(0, 10).split('-').reverse().join('-');
  const ws = setupSheet(wb, dateStr);
  ws.columns = [
    { width: 26 }, { width: 10 }, { width: 8 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 4 }, { width: 16 }, { width: 12 },
  ];

  const headerRow = ws.getRow(3);
  headerRow.values = ['نام', 'وزن', 'ریٹ', 'رقم', 'بقایہ رقم', 'ٹوٹل رقم', '', 'ریکوری جمع', 'نیا بقایہ'];
  styleHeaderRow(headerRow);

  const startRow = 4;
  sheet.entries.forEach((e, i) => {
    const r = startRow + i;
    const row = ws.getRow(r);
    row.getCell(1).value = e.customerName || '';
    row.getCell(2).value =
      e.loads && e.loads.length > 1 ? fx(e.loads.map((l) => l.weight).join('+'), e.weight) : F.num(e.weight);
    row.getCell(3).value = F.num(e.rate);
    row.getCell(4).value = fx(`B${r}*C${r}`, e.amount);
    row.getCell(5).value = F.num(e.previousBalance);
    row.getCell(6).value = fx(`D${r}+E${r}`, e.totalAmount);
    row.getCell(8).value =
      e.recoveries && e.recoveries.length > 1
        ? fx(e.recoveries.map((rc) => rc.amount).join('+'), e.recovery)
        : F.num(e.recovery);
    row.getCell(9).value = fx(`F${r}-H${r}`, e.closingBalance);
    row.getCell(1).alignment = { horizontal: 'right' };
  });

  const lastDataRow = startRow + sheet.entries.length - 1;
  const totalsRow = lastDataRow + 1;
  const t = sheet.totals;
  const tRow = ws.getRow(totalsRow);
  tRow.getCell(1).value = 'ٹوٹل';
  tRow.getCell(2).value = fx(`SUM(B${startRow}:B${lastDataRow})`, t.weight);
  tRow.getCell(3).value = fx(`D${totalsRow}/B${totalsRow}`, t.avgRate);
  tRow.getCell(4).value = fx(`SUM(D${startRow}:D${lastDataRow})`, t.amount);
  tRow.getCell(5).value = fx(`SUM(E${startRow}:E${lastDataRow})`, t.previousBalance);
  tRow.getCell(6).value = fx(`SUM(F${startRow}:F${lastDataRow})`, t.totalAmount);
  tRow.getCell(8).value = fx(`SUM(H${startRow}:H${lastDataRow})`, t.recovery);
  tRow.getCell(9).value = fx(`SUM(I${startRow}:I${lastDataRow})`, t.closingBalance);
  tRow.eachCell((c) => {
    c.fill = TOTAL_FILL;
    c.font = { bold: true };
  });

  // ---- خرید / سپلائی ----
  let r = totalsRow + 3;
  ws.getCell(`A${r}`).value = 'خرید / سپلائی';
  ws.getCell(`A${r}`).font = { bold: true };
  r += 1;
  const purHeadRow = ws.getRow(r);
  purHeadRow.values = ['سپلائر', 'ریٹ', 'وزن', 'رقم'];
  styleHeaderRow(purHeadRow);
  const purStart = r + 1;
  sheet.purchases.forEach((p, i) => {
    const rr = purStart + i;
    ws.getCell(`A${rr}`).value = p.supplierName || '';
    ws.getCell(`B${rr}`).value = F.num(p.rate);
    ws.getCell(`C${rr}`).value = F.num(p.weight);
    ws.getCell(`D${rr}`).value = fx(`B${rr}*C${rr}`, p.amount);
  });
  const purEnd = purStart + Math.max(sheet.purchases.length, 1) - 1;
  const purTotalRow = purEnd + 1;
  ws.getCell(`A${purTotalRow}`).value = 'ٹوٹل خرید';
  ws.getCell(`A${purTotalRow}`).font = { bold: true };
  ws.getCell(`C${purTotalRow}`).value = fx(`SUM(C${purStart}:C${purEnd})`, t.purchaseWeight);
  ws.getCell(`D${purTotalRow}`).value = fx(`SUM(D${purStart}:D${purEnd})`, t.purchaseAmount);

  const shortRow = purTotalRow + 1;
  ws.getCell(`A${shortRow}`).value = 'ایکسسز/شارٹ';
  ws.getCell(`C${shortRow}`).value = fx(`B${totalsRow}-C${purTotalRow}`, t.excessShort);

  // ---- خرچے ----
  let er = shortRow + 3;
  ws.getCell(`A${er}`).value = 'خرچے';
  ws.getCell(`A${er}`).font = { bold: true };
  er += 1;
  const expHeadRow = ws.getRow(er);
  expHeadRow.values = ['مد', 'رقم'];
  styleHeaderRow(expHeadRow);
  const expStart = er + 1;
  sheet.expenses.forEach((x, i) => {
    const rr = expStart + i;
    ws.getCell(`A${rr}`).value = x.headName || 'متفرق';
    ws.getCell(`B${rr}`).value = F.num(x.amount);
  });
  const expEnd = expStart + Math.max(sheet.expenses.length, 1) - 1;
  const expTotalRow = expEnd + 1;
  ws.getCell(`A${expTotalRow}`).value = 'کل خرچا';
  ws.getCell(`A${expTotalRow}`).font = { bold: true };
  ws.getCell(`B${expTotalRow}`).value = fx(`SUM(B${expStart}:B${expEnd})`, t.expenseTotal);

  // ---- منافع ----
  let pr = expTotalRow + 2;
  ws.getCell(`A${pr}`).value = 'کل فروخت';
  ws.getCell(`B${pr}`).value = fx(`D${totalsRow}`, t.amount);
  pr += 1;
  const grossRow = pr;
  ws.getCell(`A${pr}`).value = 'بچت';
  ws.getCell(`B${pr}`).value = fx(`B${pr - 1}-D${purTotalRow}`, t.grossProfit);
  pr += 1;
  ws.getCell(`A${pr}`).value = 'خرچا';
  ws.getCell(`B${pr}`).value = fx(`B${expTotalRow}`, t.expenseTotal);
  pr += 1;
  ws.getCell(`A${pr}`).value = 'صافی بچت';
  ws.getCell(`A${pr}`).font = { bold: true };
  ws.getCell(`B${pr}`).value = fx(`B${grossRow}-B${pr - 1}`, t.netProfit);
  ws.getCell(`B${pr}`).font = { bold: true };

  // ---- کوسٹنگ ----
  let cr = pr + 2;
  ws.getCell(`A${cr}`).value = 'کوسٹنگ';
  ws.getCell(`A${cr}`).font = { bold: true };
  cr += 1;
  const baseRateRow = cr;
  ws.getCell(`A${cr}`).value = 'بنیادی ریٹ';
  ws.getCell(`B${cr}`).value = F.num(sheet.costing?.baseRate);
  cr += 1;
  ws.getCell(`A${cr}`).value = 'شارٹ کی مالیت';
  ws.getCell(`B${cr}`).value = F.num(sheet.costing?.shortValue);
  const shortValRow = cr;
  cr += 1;
  const perKgRow = cr;
  ws.getCell(`A${cr}`).value = 'فی کلو خرچہ';
  ws.getCell(`B${cr}`).value = fx(`(B${shortValRow}+B${expTotalRow})/B${totalsRow}`, sheet.costing?.perKg);
  cr += 1;
  ws.getCell(`A${cr}`).value = 'کوسٹنگ ریٹ';
  ws.getCell(`B${cr}`).value = fx(`B${perKgRow}+B${baseRateRow}`, sheet.costing?.costingRate);
  ws.getCell(`A${cr}`).font = { bold: true };
  ws.getCell(`B${cr}`).font = { bold: true };

  ws.eachRow((row) => row.eachCell((c) => (c.font = { ...(c.font || {}), name: 'Arial' })));
}

/* ========================================================================== */
/* پارٹی لیجر شیٹ                                                            */
/* ========================================================================== */
function buildPartyWorksheet(wb, partyName, rows) {
  const ws = setupSheet(wb, `پارٹی - ${partyName}`.slice(0, 31));
  ws.columns = [{ width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 34 }, { width: 14 }];
  const head = ws.getRow(1);
  head.values = ['تاریخ', 'فروخت', 'ریکوری', 'جمع', 'خرچہ', 'حوالہ', 'بقایہ'];
  styleHeaderRow(head);

  rows.forEach((r, i) => {
    const rr = i + 2;
    const row = ws.getRow(rr);
    row.getCell(1).value = new Date(r.date).toISOString().slice(0, 10);
    row.getCell(2).value = F.num(r.saleAmount) || '';
    row.getCell(3).value = F.num(r.recoveryAmount) || '';
    row.getCell(4).value = F.num(r.debit) || '';
    row.getCell(5).value = F.num(r.credit) || '';
    row.getCell(6).value = r.reference || '';
    row.getCell(7).value =
      rr === 2
        ? fx(`D${rr}-E${rr}`, r.balance)
        : fx(`IF(AND(D${rr}="",E${rr}=""),G${rr - 1},G${rr - 1}+D${rr}-E${rr})`, r.balance);
  });
  ws.eachRow((row) => row.eachCell((c) => (c.font = { ...(c.font || {}), name: 'Arial' })));
}

/* ========================================================================== */
/* بینک لیجر شیٹ                                                             */
/* ========================================================================== */
function buildBankWorksheet(wb, account, rows) {
  const ws = setupSheet(wb, `بینک - ${account.title}`.slice(0, 31));
  ws.columns = [{ width: 6 }, { width: 12 }, { width: 40 }, { width: 12 }, { width: 12 }, { width: 12 }];
  ws.getCell('A1').value = `${account.accountNo}    ${account.title}`;
  ws.getCell('A2').value = `${account.bankName} ${account.branch || ''}`;
  const head = ws.getRow(4);
  head.values = ['S. No.', 'تاریخ', 'حوالہ', 'جمع کرواے', 'نکالے', 'بقایہ'];
  styleHeaderRow(head);

  const openingDate = account.openingDate || (rows[0] && rows[0].date) || new Date();
  ws.getRow(5).values = [
    0,
    new Date(openingDate).toISOString().slice(0, 10),
    'ACCOUNT BALANCE',
    F.num(account.openingBalance),
    '',
    F.num(account.openingBalance),
  ];

  rows.forEach((r, i) => {
    const rr = i + 6;
    const row = ws.getRow(rr);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = new Date(r.date).toISOString().slice(0, 10);
    row.getCell(3).value = r.reference || '';
    row.getCell(4).value = F.num(r.deposit) || '';
    row.getCell(5).value = F.num(r.withdraw) || '';
    row.getCell(6).value = fx(`IF(AND(D${rr}="",E${rr}=""),F${rr - 1},F${rr - 1}+D${rr}-E${rr})`, r.balance);
  });
  ws.eachRow((row) => row.eachCell((c) => (c.font = { ...(c.font || {}), name: 'Arial' })));
}

/* ========================================================================== */
/* سپلائر لیجر شیٹ                                                           */
/* ========================================================================== */
function buildSupplierWorksheet(wb, supplier, rows) {
  const ws = setupSheet(wb, `سپلائر - ${supplier.name}`.slice(0, 31));
  ws.columns = [
    { width: 12 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 34 },
  ];
  const head = ws.getRow(4);
  head.values = ['تاریخ', 'گاڑی نمبر', 'وزن', 'ریٹ', 'رقم', 'پچھلا بیلنس', 'ٹوٹل', 'دیے', 'بقایہ', 'تفصیل'];
  styleHeaderRow(head);

  const openingDate = (rows[0] && rows[0].date) || new Date();
  const r5 = ws.getRow(5);
  r5.getCell(1).value = new Date(openingDate).toISOString().slice(0, 10);
  r5.getCell(6).value = F.num(supplier.openingBalance);
  r5.getCell(7).value = fx('E5+F5', supplier.openingBalance);
  r5.getCell(9).value = fx('G5-H5', supplier.openingBalance);
  r5.getCell(10).value = 'اوپننگ بیلنس';

  rows.forEach((r, i) => {
    const rr = i + 6;
    const row = ws.getRow(rr);
    row.getCell(1).value = new Date(r.date).toISOString().slice(0, 10);
    row.getCell(2).value = r.vehicleNo || '';
    row.getCell(3).value = F.num(r.weight) || '';
    row.getCell(4).value = F.num(r.rate) || '';
    row.getCell(5).value = fx(`C${rr}*D${rr}`, r.amount);
    row.getCell(6).value = fx(`I${rr - 1}`, r.previousBalance);
    row.getCell(7).value = fx(`E${rr}+F${rr}`, r.total);
    row.getCell(8).value = F.num(r.paid) || '';
    row.getCell(9).value = fx(`G${rr}-H${rr}`, r.balance);
    row.getCell(10).value = r.description || '';
  });
  ws.eachRow((row) => row.eachCell((c) => (c.font = { ...(c.font || {}), name: 'Arial' })));
}

/* ========================================================================== */
/* مین ہینڈلر                                                                */
/* ========================================================================== */
exports.exportExcel = asyncH(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new AppError('from اور to دونوں تاریخیں ضروری ہیں', 400);

  const fromD = dayStart(from);
  const toD = dayStart(to);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'کراچی مرغی سپلائی — لیجر';
  wb.created = new Date();
  // فائل کھلتے ہی Excel خود دوبارہ حساب لگائے — cached result کے باوجود، تاکہ
  // اگر یوزر بعد میں کوئی نمبر بدلے تو زنجیر درست رہے
  wb.calcProperties = { fullCalcOnLoad: true };

  const sheets = await DailySheet.find({ date: { $gte: fromD, $lte: toD } })
    .sort({ date: 1 })
    .populate('entries.customer', 'name')
    .populate('purchases.supplier', 'name')
    .lean();

  if (sheets.length === 0) throw new AppError('اس دورانیے میں کوئی شیٹ نہیں ملی', 404);

  sheets.forEach((s) => buildDailyWorksheet(wb, s));

  const partyNames = await PartyLedger.distinct('party', { date: { $gte: fromD, $lte: toD } });
  for (const name of partyNames) {
    const rows = await PartyLedger.find({ party: name, date: { $gte: fromD, $lte: toD } })
      .sort({ date: 1, serial: 1 })
      .lean();
    if (rows.length) buildPartyWorksheet(wb, name, rows);
  }

  const banks = await BankAccount.find({ isActive: true }).lean();
  for (const acc of banks) {
    const rows = await BankTransaction.find({ account: acc._id, date: { $gte: fromD, $lte: toD } })
      .sort({ date: 1, serial: 1 })
      .lean();
    if (rows.length) buildBankWorksheet(wb, acc, rows);
  }

  const suppliers = await Supplier.find({ isActive: true }).lean();
  for (const sup of suppliers) {
    const rows = await SupplierTransaction.find({ supplier: sup._id, date: { $gte: fromD, $lte: toD } })
      .sort({ date: 1, createdAt: 1 })
      .lean();
    if (rows.length) buildSupplierWorksheet(wb, sup, rows);
  }

  const fname = `ledger_${from}_to_${to}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  await wb.xlsx.write(res);
  res.end();
});
