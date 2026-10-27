/**
 * EXCEL IMPORT — PARSER
 * ---------------------------------------------------------------------------
 * لیجر کی ماہانہ Excel فائل پڑھ کر سادہ JavaScript ڈیٹا بناتا ہے۔
 * یہ فائل ڈیٹابیس کو نہیں چھوتی — صرف پڑھتی اور سمجھتی ہے۔
 *
 * پہچان (شیٹ کے نام پر نہیں، اس کے ڈھانچے پر):
 *   • روزانہ شیٹ  : نام  DD-MM-YYYY   (مثلاً 01-10-2026)
 *   • بینک        : A1 میں «ACCOUNT NO: ...»  یا ہیڈر میں «جمع کرواے»
 *   • سپلائر      : ہیڈر میں «گاڑی نمبر»
 *   • پارٹی       : ہیڈر میں «ریکوری» اور «خرچہ»
 */
'use strict';

const ExcelJS = require('exceljs');

/* ------------------------------------------------------------ helpers ---- */

/** پوشیدہ حروف ہٹا کر، خالی جگہیں ایک کر کے، trim */
const normText = (s) =>
  String(s === null || s === undefined ? '' : s)
    .replace(/[\u200b-\u200f\u202a-\u202e\u0640\u064b-\u065f\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const LETTER_FIX = { ي: 'ی', ى: 'ی', ێ: 'ی', ك: 'ک', ھ: 'ہ', ۃ: 'ہ', ة: 'ہ', ۀ: 'ہ', ە: 'ہ' };

/** نام ملانے کی چابی: ی/ک/ہ کی مختلف شکلیں ایک، انگریزی چھوٹی */
const nameKey = (s) =>
  normText(s)
    .replace(/[يىێكھۃةۀە]/g, (c) => LETTER_FIX[c])
    .toLowerCase();

/** خالی جگہ کے بغیر چابی — «ٹنڈو آدم» اور «ٹنڈوآدم» برابر */
const compactKey = (s) => nameKey(s).replace(/\s+/g, '');

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v instanceof Date) return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad2 = (x) => String(x).padStart(2, '0');

/** Date / Excel serial / متن  →  'YYYY-MM-DD'  (نہ سمجھ آئے تو null) */
function toISODate(v) {
  let iso = null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) iso = v.toISOString().slice(0, 10);
  else if (typeof v === 'number' && v > 20000 && v < 80000)
    iso = new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  else if (typeof v === 'string') {
    const s = normText(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) iso = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    else {
      m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); // D/M/YYYY (پاکستانی ترتیب)
      if (m) iso = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    }
  }
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  return y >= 2000 && y <= 2100 ? iso : null;
}

/**
 * سیل کی «حصوں» میں تقسیم:  =980.8+228  →  [980.8, 228]
 * صرف سادہ جمع کا فارمولا تقسیم ہوتا ہے، اور حصوں کا جوڑ Excel کے نتیجے سے
 * ملنا لازمی ہے — ورنہ سیل کی محفوظ شدہ (cached) قدر ہی لی جاتی ہے۔
 */
function numberParts(cell) {
  const cached = toNum(cell.v);
  if (cell.f) {
    const body = String(cell.f).replace(/^=/, '').replace(/\s+/g, '');
    if (/^[0-9.]+(\+[0-9.]+)*$/.test(body)) {
      const parts = body.split('+').map(Number).filter((n) => Number.isFinite(n));
      const total = parts.reduce((t, n) => t + n, 0);
      if (Math.abs(total - cached) < 0.01) return parts.filter((n) => n !== 0);
    }
  }
  return cached ? [cached] : [];
}

/* ------------------------------------------------------------- reader ---- */

/** ExcelJS سیل → { v: قدر (formula ہو تو نتیجہ), f: formula یا null } */
function readCell(cell) {
  let v = cell.value;
  let f = null;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) {
      f = v.formula || cell.formula || null;
      v = v.result;
    } else if ('richText' in v) v = v.richText.map((r) => r.text).join('');
    else if ('text' in v) v = v.text;
    else v = null; // error وغیرہ
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) v = null;
  return { v: v === undefined ? null : v, f };
}

/** xlsx بفر → شیٹوں کی سادہ فہرست  [{ name, maxRow, cell(r,c) }] */
async function loadWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({
    name: ws.name,
    maxRow: Math.max(ws.rowCount || 0, ws.lastRow ? ws.lastRow.number : 0),
    cell: (r, c) => readCell(ws.getCell(r, c)),
  }));
}

/* ------------------------------------------------------- daily sheets ---- */

const DAILY_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const FIRST_ROW = 4;

function parseDailySheet(ws, warnings) {
  const m = ws.name.trim().match(DAILY_RE);
  const date = `${m[3]}-${m[2]}-${m[1]}`;

  /* «ٹوٹل» والی لائن ڈھونڈیں — گاہکوں کی لائنیں اس سے پہلے ختم ہوتی ہیں */
  let T = 0;
  for (let r = FIRST_ROW; r <= Math.min(ws.maxRow, 300); r += 1) {
    if (normText(ws.cell(r, 1).v) === 'ٹوٹل') {
      T = r;
      break;
    }
  }
  if (!T) {
    warnings.push(`شیٹ «${ws.name}»: «ٹوٹل» والی لائن نہیں ملی — چھوڑ دی گئی`);
    return null;
  }

  const rows = [];
  for (let r = FIRST_ROW; r < T; r += 1) {
    const name = normText(ws.cell(r, 1).v);
    if (!name) continue;
    rows.push({
      slot: r - FIRST_ROW + 1, // Excel کی لائن = گاہک کا خانہ (sortOrder)
      name,
      loads: numberParts(ws.cell(r, 2)),
      rate: toNum(ws.cell(r, 3).v),
      recoveries: numberParts(ws.cell(r, 8)),
      prevExcel: toNum(ws.cell(r, 5).v),
      closingExcel: toNum(ws.cell(r, 9).v),
    });
  }

  /* خرید  (T+4 .. T+9) : C = ریٹ ، D = وزن ، E = نام */
  const purchases = [];
  for (let r = T + 4; r <= T + 9; r += 1) {
    const weight = numberParts(ws.cell(r, 4)).reduce((t, n) => t + n, 0);
    const rate = toNum(ws.cell(r, 3).v);
    if (weight > 0 || rate > 0) purchases.push({ label: normText(ws.cell(r, 5).v), weight, rate });
  }

  /* خرچے  (T+15 : A) = 72130+3000+350+200  →  ترتیب وار مدّوں میں */
  const expenses = numberParts(ws.cell(T + 15, 1));

  /* کوسٹنگ: G(T+9) = G(T+8)+322 →  baseRate 322 ؛ G(T+5) = دستی شارٹ */
  const baseCell = ws.cell(T + 9, 7);
  const bm = baseCell.f ? String(baseCell.f).replace(/\s+/g, '').match(/\+([0-9.]+)$/) : null;
  const shortCell = ws.cell(T + 5, 7);
  const shortRaw = shortCell.f ? null : shortCell.v;
  const manualShortValue =
    shortRaw === null || shortRaw === undefined || normText(shortRaw) === '' ? null : toNum(shortRaw);

  return {
    sheetName: ws.name,
    date,
    rows,
    purchases,
    expenses,
    costing: { baseRate: bm ? Number(bm[1]) : 0, manualShortValue },
    excel: {
      weight: toNum(ws.cell(T, 2).v),
      amount: toNum(ws.cell(T, 4).v),
      recovery: toNum(ws.cell(T, 8).v),
      closing: toNum(ws.cell(T, 9).v),
    },
  };
}

/* ------------------------------------------------------------ ledgers ---- */

const rowText = (ws, r, cols) =>
  cols.map((c) => normText(ws.cell(r, c).v)).join('|');

function classifyLedger(ws) {
  const a1 = normText(ws.cell(1, 1).v).toUpperCase();
  const head = rowText(ws, 4, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  if (a1.includes('ACCOUNT NO') || head.includes('جمع کرواے')) return 'bank';
  if (head.includes('گاڑی نمبر')) return 'supplier';
  if (head.includes('ریکوری') && head.includes('خرچہ')) return 'party';
  return null;
}

/** آخری عددی «بقایہ» (Excel کا اپنا) — بعد میں ہمارے حساب سے ملانے کے لیے */
function lastBalance(ws, col, fromRow) {
  for (let r = ws.maxRow; r >= fromRow; r -= 1) {
    const { v } = ws.cell(r, col);
    if (typeof v === 'number') return v;
  }
  return null;
}

function parseBankSheet(ws) {
  const m = normText(ws.cell(1, 1).v).match(/ACCOUNT\s*NO[:\s]*([0-9-]+)/i);
  const rows = [];
  let lastDate = null;
  for (let r = 5; r <= ws.maxRow; r += 1) {
    const ref = normText(ws.cell(r, 3).v);
    if (ref.toUpperCase().includes('ACCOUNT BALANCE')) continue; // شروعاتی بیلنس کی لائن
    const date = toISODate(ws.cell(r, 2).v) || lastDate;
    const deposit = round2(toNum(ws.cell(r, 4).v));
    const withdraw = round2(toNum(ws.cell(r, 5).v));
    if (toISODate(ws.cell(r, 2).v)) lastDate = date;
    if (!date || (deposit === 0 && withdraw === 0)) continue;
    rows.push({ date, reference: ref, deposit, withdraw });
  }
  return {
    kind: 'bank',
    sheetName: ws.name,
    accountNo: m ? m[1] : '',
    title: normText(ws.cell(1, 1).v),
    rows,
    excelFinal: lastBalance(ws, 6, 6),
  };
}

function parsePartySheet(ws) {
  const rows = [];
  let lastDate = null;
  for (let r = 5; r <= ws.maxRow; r += 1) {
    const g = ws.cell(r, 7);
    /* شروعاتی (پچھلے مہینے کا بقایہ) لائن: G = D-E ، باقی لائنوں میں IF(...) ہوتا ہے */
    if (g.f && /^=?D\d+-E\d+$/.test(String(g.f).replace(/\s+/g, ''))) continue;
    const d = toISODate(ws.cell(r, 1).v); // A میں متن ہو تو وہ صرف نوٹ ہے، تاریخ نہیں
    if (d) lastDate = d;
    const saleAmount = round2(toNum(ws.cell(r, 2).v));
    const recoveryAmount = round2(toNum(ws.cell(r, 3).v));
    const debit = round2(toNum(ws.cell(r, 4).v));
    const credit = round2(toNum(ws.cell(r, 5).v));
    if (!lastDate || (saleAmount === 0 && recoveryAmount === 0 && debit === 0 && credit === 0)) continue;
    rows.push({ date: lastDate, saleAmount, recoveryAmount, debit, credit, reference: normText(ws.cell(r, 6).v) });
  }
  return {
    kind: 'party',
    sheetName: ws.name,
    party: normText(ws.name.replace(/[\d\s]+$/, '')),
    rows,
    excelFinal: lastBalance(ws, 7, 6),
  };
}

function parseSupplierSheet(ws) {
  const rows = [];
  let lastDate = null;
  for (let r = 5; r <= ws.maxRow; r += 1) {
    const d = toISODate(ws.cell(r, 1).v);
    if (d) lastDate = d;
    const weight = numberParts(ws.cell(r, 3)).reduce((t, n) => t + n, 0);
    const rate = toNum(ws.cell(r, 4).v);
    const paid = round2(toNum(ws.cell(r, 8).v));
    if (!lastDate || (weight === 0 && rate === 0 && paid === 0)) continue;
    rows.push({
      date: lastDate,
      vehicleNo: normText(ws.cell(r, 2).v),
      weight,
      rate,
      paid,
      description: normText(ws.cell(r, 10).v),
    });
  }
  const title = normText(ws.cell(1, 1).v).replace(/کراچی\s*کا\s*لیجر/, '');
  return {
    kind: 'supplier',
    sheetName: ws.name,
    supplierName: normText(title) || normText(ws.name.replace(/[\d\s]+$/, '')),
    sheetNameGuess: normText(ws.name.replace(/[\d\s]+$/, '')),
    rows,
    excelFinal: lastBalance(ws, 9, 6),
  };
}

/* -------------------------------------------------------------- main ---- */

/** شیٹوں کی فہرست (loadWorkbook کا نتیجہ) → سمجھا ہوا ڈیٹا */
function parseSheets(sheets) {
  const warnings = [];
  const daily = [];
  const ledgers = [];
  const unknown = [];

  for (const ws of sheets) {
    if (DAILY_RE.test(ws.name.trim())) {
      const parsed = parseDailySheet(ws, warnings);
      if (parsed) daily.push(parsed);
      continue;
    }
    const kind = classifyLedger(ws);
    if (kind === 'bank') ledgers.push(parseBankSheet(ws));
    else if (kind === 'party') ledgers.push(parsePartySheet(ws));
    else if (kind === 'supplier') ledgers.push(parseSupplierSheet(ws));
    else unknown.push(ws.name);
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set();
  for (const s of daily) {
    if (seen.has(s.date)) warnings.push(`تاریخ ${s.date} فائل میں ایک سے زیادہ بار ہے — پہلی شیٹ لی جائے گی`);
    seen.add(s.date);
  }
  const unique = daily.filter((s, i) => daily.findIndex((x) => x.date === s.date) === i);

  return { daily: unique, ledgers, unknown, warnings };
}

async function parseWorkbookBuffer(buffer) {
  return parseSheets(await loadWorkbook(buffer));
}

module.exports = {
  normText,
  nameKey,
  compactKey,
  toNum,
  toISODate,
  numberParts,
  loadWorkbook,
  parseSheets,
  parseWorkbookBuffer,
};
