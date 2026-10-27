/**
 * EXCEL IMPORT — کنٹرولر
 * ---------------------------------------------------------------------------
 *  POST /import/preview   فائل پڑھ کر بتاتا ہے کیا نیا ہے، کیا پہلے سے ہے (کچھ لکھتا نہیں)
 *  POST /import/commit    صرف نیا ڈیٹا ڈیٹابیس میں ڈالتا ہے
 *
 * فائل base64 کی صورت JSON میں آتی ہے: { fileName, data: "<base64>", options }
 *
 * duplicate سے بچاؤ:
 *   • روزانہ شیٹ : جس تاریخ کی شیٹ ڈیٹابیس میں ہے وہ چھوڑ دی جاتی ہے (کبھی overwrite نہیں)
 *   • لیجر لائنیں : (تاریخ + رقم) برابر ہو — تفصیل کا متن نہیں دیکھا جاتا تو وہی لائن شمار ہوتی ہے؛ گنتی کے حساب سے
 *                   مقابلہ ہوتا ہے، اس لیے دوبارہ اپ لوڈ کرنے پر کچھ دوگنا نہیں ہوتا
 */
'use strict';

const DailySheet = require('../models/DailySheet');
const { Customer, Supplier, ExpenseHead } = require('../models/Master');
const { BankAccount, BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const { asyncH, AppError } = require('../middleware');
const { recomputeSheet, cascadeFrom, previousClosingFor, recalcBank, recalcSupplier, recalcParty } = require('../utils/recalc');
const F = require('../utils/formulas');
const X = require('../utils/excelImport');
const P = require('../utils/importPlan');

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const dayKey = (v) => new Date(v).toISOString().slice(0, 10);
const amt = (v) => F.round(F.num(v));
const TOLERANCE = 1; // Excel کی floating قدروں کے مقابلے میں ایک روپیہ تک فرق ٹھیک

/* ------------------------------------------------------------- upload ---- */

async function readAndParse(req) {
  const raw = req.body && req.body.data;
  if (!raw || typeof raw !== 'string') throw new AppError('Excel فائل نہیں ملی', 400);
  const buf = Buffer.from(raw.replace(/^data:[^,]*,/, ''), 'base64');
  if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new AppError('یہ درست .xlsx فائل نہیں لگتی (پرانی .xls کو پہلے .xlsx میں محفوظ کریں)', 400);
  }
  try {
    return await X.parseWorkbookBuffer(buf);
  } catch (e) {
    throw new AppError(`Excel فائل پڑھی نہیں جا سکی: ${e.message}`, 422);
  }
}

/* --------------------------------------------------------------- plan ---- */

const bankKey = (r) => JSON.stringify([dayKey(r.date), amt(r.deposit), amt(r.withdraw)]);
const partyKey = (r) =>
  JSON.stringify([dayKey(r.date), amt(r.saleAmount), amt(r.recoveryAmount), amt(r.debit), amt(r.credit)]);
const supplierKey = (r) =>
  JSON.stringify([dayKey(r.date), F.round(F.num(r.weight), 3), amt(r.rate), amt(r.paid)]);

/** ایک لیجر شیٹ: کون سا کھاتہ ہے، کتنی لائنیں نئی ہیں، کتنی پہلے سے */
async function planLedger(l, ctx) {
  const base = {
    kind: l.kind,
    sheetName: l.sheetName,
    total: l.rows.length,
    fresh: [],
    duplicates: 0,
    target: null,
    warning: null,
    excelFinal: l.excelFinal,
  };

  if (l.kind === 'bank') {
    const want = String(l.accountNo || '').replace(/\s/g, '');
    const acc = ctx.banks.find((b) => String(b.accountNo).replace(/\s/g, '') === want);
    if (!acc) return { ...base, warning: `اکاؤنٹ نمبر «${l.accountNo || '؟'}» ڈیٹابیس میں نہیں ملا — پہلے «بینک کھاتہ» میں بنائیں` };
    const existing = await BankTransaction.find({ account: acc._id }, { date: 1, reference: 1, deposit: 1, withdraw: 1 }).lean();
    const { fresh, duplicates } = P.multisetDiff(l.rows, existing, bankKey);
    return { ...base, fresh, duplicates, target: { id: String(acc._id), name: `${acc.title} — ${acc.bankName || ''}`.trim() }, acc };
  }

  if (l.kind === 'party') {
    const hit = ctx.parties.find((p) => X.compactKey(p) === X.compactKey(l.party));
    const name = hit || l.party;
    const existing = hit ? await PartyLedger.find({ party: hit }, { date: 1, saleAmount: 1, recoveryAmount: 1, debit: 1, credit: 1, reference: 1 }).lean() : [];
    const { fresh, duplicates } = P.multisetDiff(l.rows, existing, partyKey);
    return { ...base, fresh, duplicates, target: { id: name, name }, partyName: name, isNewParty: !hit };
  }

  /* supplier */
  const wanted = [X.compactKey(l.supplierName), X.compactKey(l.sheetNameGuess)];
  const sup = ctx.suppliers.find((s) => wanted.includes(X.compactKey(s.name)));
  if (!sup) return { ...base, warning: `سپلائر «${l.supplierName}» ڈیٹابیس میں نہیں ملا — پہلے «سپلائر» میں بنائیں` };
  const existing = await SupplierTransaction.find({ supplier: sup._id }, { date: 1, vehicleNo: 1, weight: 1, rate: 1, paid: 1, description: 1 }).lean();
  const { fresh, duplicates } = P.multisetDiff(l.rows, existing, supplierKey);
  return { ...base, fresh, duplicates, target: { id: String(sup._id), name: sup.name }, sup };
}

async function buildPlan(parsed) {
  const [customers, suppliers, banks, sheetDocs, parties] = await Promise.all([
    Customer.find().lean(),
    Supplier.find().lean(),
    BankAccount.find().lean(),
    DailySheet.find({}, { date: 1 }).lean(),
    PartyLedger.distinct('party'),
  ]);

  const existingDates = sheetDocs.map((s) => dayKey(s.date)).sort();
  const existingSet = new Set(existingDates);
  const newSheets = parsed.daily.filter((s) => !existingSet.has(s.date));
  const cust = P.resolveCustomers(newSheets, customers);

  const ledgers = [];
  for (const l of parsed.ledgers) ledgers.push(await planLedger(l, { suppliers, banks, parties }));

  return { customers, suppliers, existingDates, existingSet, newSheets, cust, ledgers };
}

/* ------------------------------------------------------------ preview ---- */

exports.preview = asyncH(async (req, res) => {
  const parsed = await readAndParse(req);
  const plan = await buildPlan(parsed);

  const daily = parsed.daily.map((s) => ({
    date: s.date,
    sheetName: s.sheetName,
    status: plan.existingSet.has(s.date) ? 'exists' : 'new',
    weight: F.round(s.excel.weight),
    amount: F.round(s.excel.amount),
    recovery: F.round(s.excel.recovery),
    active: s.rows.filter((r) => r.loads.length || r.recoveries.length).length,
  }));

  const ledgers = plan.ledgers.map((l) => ({
    kind: l.kind,
    sheetName: l.sheetName,
    target: l.target ? l.target.name : null,
    isNewParty: !!l.isNewParty,
    total: l.total,
    newCount: l.fresh.length,
    duplicates: l.duplicates,
    warning: l.warning,
    sample: l.fresh.slice(0, 6).map((r) => ({
      date: r.date,
      text: r.reference || r.description || '',
      in: r.deposit ?? r.debit ?? (r.weight ? F.round(r.weight * r.rate) : 0),
      out: r.withdraw ?? r.credit ?? r.paid ?? 0,
    })),
  }));

  const warnings = [...parsed.warnings, ...plan.cust.problems, ...parsed.unknown.map((n) => `شیٹ «${n}» پہچانی نہیں گئی — چھوڑ دی جائے گی`)];
  plan.ledgers.forEach((l) => l.warning && warnings.push(`«${l.sheetName}»: ${l.warning}`));

  res.json({
    ok: true,
    data: {
      daily,
      customers: {
        created: plan.cust.created.map((c) => ({ name: c.name, slot: c.slot, openingBalance: F.round(c.openingBalance) })),
        renamed: plan.cust.renamed.map((r) => ({
          slot: r.slot,
          dbName: r.dbName,
          finalName: r.finalName,
          names: r.names,
        })),
      },
      ledgers,
      totals: {
        newSheets: plan.newSheets.length,
        existingSheets: daily.length - plan.newSheets.length,
        newLedgerRows: plan.ledgers.reduce((t, l) => t + l.fresh.length, 0),
        duplicateLedgerRows: plan.ledgers.reduce((t, l) => t + l.duplicates, 0),
      },
      warnings,
    },
  });
});

/* -------------------------------------------------------- commit: daily -- */

async function importDaily(plan, user, options) {
  const out = {
    sheetsCreated: 0,
    sheetsSkipped: 0,
    customersCreated: 0,
    customersRenamed: 0,
    cascaded: 0,
    verify: { checkedRows: 0, mismatchedRows: 0, worstDiff: 0, sheets: [], ok: true },
    notes: [],
  };
  const { newSheets, cust } = plan;
  if (!newSheets.length) return out;

  /* ۱) نئے گاہک */
  const idMap = new Map(); // 'new:...' → ObjectId
  for (const c of cust.created) {
    const doc = await Customer.create({
      name: c.name,
      openingBalance: F.round(c.openingBalance),
      openingDate: d(c.openingDate),
      sortOrder: c.sortOrder,
    });
    idMap.set(c.id, doc._id);
    out.customersCreated += 1;
  }
  const idOf = (cand) => (cand.isNew ? String(idMap.get(cand.id)) : cand.id);

  /* ۲) نام اپڈیٹ (اختیاری): صرف جن کا آخری شیٹ میں بھی نیا نام ہے */
  if (options.updateCustomerNames) {
    const taken = new Map(plan.customers.map((c) => [X.nameKey(c.name), String(c._id)]));
    for (const r of cust.renamed) {
      if (!r.finalName) continue;
      const k = X.nameKey(r.finalName);
      if (taken.has(k) && taken.get(k) !== r.id) {
        out.notes.push(`«${r.finalName}» نام پہلے سے کسی اور گاہک کا ہے — «${r.dbName}» کا نام نہیں بدلا`);
        continue;
      }
      await Customer.updateOne({ _id: r.id }, { $set: { name: r.finalName } });
      taken.set(k, r.id);
      out.customersRenamed += 1;
    }
  }

  /* ۳) شیٹیں، تاریخ کی ترتیب سے — ہر گاہک کا «پچھلا بقایہ» ایک چلتی زنجیر میں */
  const [heads, suppliers] = await Promise.all([ExpenseHead.find().sort({ sortOrder: 1 }).lean(), Supplier.find().lean()]);
  const minDate = newSheets[0].date;
  const maxDate = newSheets[newSheets.length - 1].date;
  const between = plan.existingDates.filter((x) => x > minDate && x < maxDate);
  const timeline = [
    ...newSheets.map((s) => ({ date: s.date, sheet: s })),
    ...between.map((x) => ({ date: x, sheet: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const prev = new Map(); // گاہک id → پچھلا کلوزنگ

  for (const step of timeline) {
    /* درمیان میں پہلے سے موجود شیٹ: بس اس کا کلوزنگ زنجیر میں لے لیں */
    if (!step.sheet) {
      const old = await DailySheet.findOne({ date: d(step.date) }, { 'entries.customer': 1, 'entries.closingBalance': 1 }).lean();
      (old ? old.entries : []).forEach((e) => prev.set(String(e.customer), F.num(e.closingBalance)));
      continue;
    }

    const s = step.sheet;
    const items = cust.perSheet.get(s.date).filter((o) => o.cand);

    for (const o of items) {
      const id = idOf(o.cand);
      if (!prev.has(id)) prev.set(id, await previousClosingFor(id, d(s.date)));
    }

    const sheet = new DailySheet({ date: d(s.date), createdBy: user._id, updatedBy: user._id });
    sheet.entries = items.map((o) => {
      const id = idOf(o.cand);
      const loads = o.row.loads.map((w) => ({ weight: F.num(w) }));
      return {
        customer: id,
        customerName: X.normText(o.row.name), // اُس دن کی Excel والی شکل محفوظ
        sortOrder: o.cand.sortOrder,
        loads,
        weight: F.round(loads.reduce((t, l) => t + l.weight, 0)),
        rate: F.num(o.row.rate),
        recoveries: o.row.recoveries.map((a) => ({ amount: F.num(a), mode: 'cash' })),
        previousBalance: prev.get(id),
      };
    });

    sheet.purchases = s.purchases.map((p) => {
      const sup = P.matchSupplier(p.label, suppliers);
      return {
        supplier: sup ? sup._id : undefined,
        supplierName: sup ? sup.name : p.label,
        vehicleNo: sup ? sup.vehicleNo : '',
        weight: F.num(p.weight),
        rate: F.num(p.rate),
      };
    });

    sheet.expenses = s.expenses.map((a, i) => ({
      head: heads[i] ? heads[i]._id : undefined,
      headName: heads[i] ? heads[i].name : 'متفرق',
      amount: F.num(a),
    }));

    const biggest = [...sheet.purchases].sort((a, b) => b.weight - a.weight)[0];
    sheet.costing = {
      baseRate: F.num(s.costing.baseRate) || (biggest ? biggest.rate : 0),
      shortWeight: null,
      manualShortValue: s.costing.manualShortValue,
    };

    await recomputeSheet(sheet, { fillPrevious: false });
    try {
      await sheet.save();
    } catch (e) {
      if (e && e.code === 11000) {
        out.notes.push(`${s.date}: اسی دوران کسی اور نے یہ شیٹ بنا لی — چھوڑ دی گئی`);
        continue;
      }
      throw e;
    }
    out.sheetsCreated += 1;

    /* زنجیر آگے بڑھائیں + Excel کے اپنے «بقایہ» سے ملا کر تسلی کریں */
    let sheetBad = 0;
    let sheetWorst = 0;
    sheet.entries.forEach((e, i) => {
      prev.set(String(e.customer), F.num(e.closingBalance));
      const diff = Math.abs(F.num(e.closingBalance) - F.num(items[i].row.closingExcel));
      out.verify.checkedRows += 1;
      if (diff > TOLERANCE) {
        sheetBad += 1;
        out.verify.mismatchedRows += 1;
      }
      sheetWorst = Math.max(sheetWorst, diff);
    });
    out.verify.worstDiff = Math.max(out.verify.worstDiff, sheetWorst);
    if (sheetBad && out.verify.sheets.length < 10) {
      out.verify.sheets.push({
        date: s.date,
        mismatches: sheetBad,
        worstDiff: F.round(sheetWorst),
        excelClosing: F.round(s.excel.closing),
        appClosing: F.round(sheet.totals.closingBalance),
      });
    }
  }

  out.verify.ok = out.verify.mismatchedRows === 0;
  out.verify.worstDiff = F.round(out.verify.worstDiff);

  /* ۴) اگر ڈیٹابیس میں آخری نئی تاریخ کے بعد (یا بیچ میں) پرانی شیٹیں ہیں تو ان کا بقایہ دوبارہ */
  if (plan.existingDates.some((x) => x > minDate)) out.cascaded = await cascadeFrom(d(minDate));

  return out;
}

/* ------------------------------------------------------ commit: ledgers -- */

async function applyLedger(p, user) {
  const info = {
    kind: p.kind,
    sheetName: p.sheetName,
    target: p.target ? p.target.name : null,
    total: p.total,
    added: 0,
    duplicates: p.duplicates,
    warning: p.warning,
    balanceCheck: null,
  };
  if (p.warning || !p.target) return info;

  let finalBalance;

  if (p.kind === 'bank') {
    const last = await BankTransaction.findOne({ account: p.acc._id }).sort({ serial: -1 }).lean();
    let serial = last ? F.num(last.serial) : 0;
    if (p.fresh.length) {
      await BankTransaction.insertMany(
        p.fresh.map((r) => ({
          account: p.acc._id,
          date: d(r.date),
          serial: (serial += 1),
          reference: r.reference,
          deposit: F.num(r.deposit),
          withdraw: F.num(r.withdraw),
          createdBy: user._id,
        }))
      );
    }
    finalBalance = await recalcBank(p.acc._id, p.acc.openingBalance);
  } else if (p.kind === 'party') {
    const last = await PartyLedger.findOne({ party: p.partyName }).sort({ serial: -1 }).lean();
    let serial = last ? F.num(last.serial) : 0;
    if (p.fresh.length) {
      await PartyLedger.insertMany(
        p.fresh.map((r) => ({
          party: p.partyName,
          date: d(r.date),
          serial: (serial += 1),
          saleAmount: F.num(r.saleAmount),
          recoveryAmount: F.num(r.recoveryAmount),
          debit: F.num(r.debit),
          credit: F.num(r.credit),
          reference: r.reference,
          createdBy: user._id,
        }))
      );
    }
    finalBalance = await recalcParty(p.partyName, 0);
  } else {
    if (p.fresh.length) {
      await SupplierTransaction.insertMany(
        p.fresh.map((r) => ({
          supplier: p.sup._id,
          date: d(r.date),
          vehicleNo: r.vehicleNo,
          weight: F.num(r.weight),
          rate: F.num(r.rate),
          paid: F.num(r.paid),
          description: r.description,
          createdBy: user._id,
        }))
      );
    }
    finalBalance = await recalcSupplier(p.sup._id, p.sup.openingBalance);
  }

  info.added = p.fresh.length;
  if (typeof p.excelFinal === 'number') {
    const diff = F.round(finalBalance - p.excelFinal);
    info.balanceCheck = { app: F.round(finalBalance), excel: F.round(p.excelFinal), diff, ok: Math.abs(diff) <= TOLERANCE };
  }
  return info;
}

/* ------------------------------------------------------------- commit ---- */

exports.commit = asyncH(async (req, res) => {
  const opts = req.body.options || {};
  const options = {
    importDaily: opts.importDaily !== false,
    importLedgers: opts.importLedgers !== false,
    updateCustomerNames: opts.updateCustomerNames !== false,
  };

  const parsed = await readAndParse(req);
  const plan = await buildPlan(parsed); // تازہ ترین حالت سے دوبارہ — preview کے بعد کچھ بدل گیا ہو تو بھی محفوظ

  const daily = options.importDaily
    ? await importDaily(plan, req.user, options)
    : { sheetsCreated: 0, customersCreated: 0, customersRenamed: 0, cascaded: 0, verify: null, notes: [] };
  daily.sheetsSkipped = parsed.daily.length - plan.newSheets.length;

  const ledgers = [];
  if (options.importLedgers) {
    for (const p of plan.ledgers) ledgers.push(await applyLedger(p, req.user));
  }

  const addedRows = ledgers.reduce((t, l) => t + l.added, 0);
  res.json({
    ok: true,
    message: `امپورٹ مکمل — ${daily.sheetsCreated} نئی شیٹیں، ${addedRows} نئی لیجر لائنیں`,
    data: { daily, ledgers, warnings: [...parsed.warnings, ...plan.cust.problems] },
  });
});

/* seed اسکرپٹ (seedOctober.js) انہی اندرونی فنکشنز سے وہی کام کرتا ہے جو ویب صفحہ کرتا ہے */
exports.__internal = { buildPlan, importDaily, applyLedger };
