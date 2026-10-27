/**
 * EXCEL IMPORT — PLANNING HELPERS  (خالص منطق، ڈیٹابیس کے بغیر)
 * ---------------------------------------------------------------------------
 * 1) گاہک ملانا      : پہلے نام سے، پھر Excel کی لائن (خانہ) سے، ورنہ نیا گاہک
 * 2) duplicate چھانٹنا: فائل کی لائنوں میں سے وہ نکالنا جو ڈیٹابیس میں پہلے سے ہیں
 * 3) سپلائر ملانا     : خرید کے لیبل سے
 */
'use strict';

const { nameKey, compactKey, normText } = require('./excelImport');

const dayBefore = (iso) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * @param sheets      نئی (درآمد ہونے والی) روزانہ شیٹیں، تاریخ کی ترتیب میں
 * @param dbCustomers ڈیٹابیس کے گاہک (lean) — _id, name, sortOrder
 *
 * ملانے کی ترتیب (ہر شیٹ میں):
 *   ۱) نام برابر (ی/ک/ہ کی شکلوں اور فالتو خالی جگہوں کو نظرانداز کر کے)
 *   ۲) نام نہ ملے تو وہی لائن نمبر (خانہ) والا گاہک — Excel میں ایک لائن ہمیشہ ایک
 *      ہی کھاتہ ہوتی ہے اور نام بدلنے پر بھی بقایہ اُسی لائن میں چلتا رہتا ہے
 *   ۳) پھر بھی نہ ملے تو نیا گاہک (اوپننگ بیلنس = Excel کا اُس دن کا «پچھلا بقایہ»)
 */
function resolveCustomers(sheets, dbCustomers) {
  const byName = new Map();
  const slotCount = new Map();
  for (const c of dbCustomers) {
    const cand = { id: String(c._id), name: c.name, sortOrder: c.sortOrder || 0, isNew: false };
    const k = nameKey(c.name);
    if (!byName.has(k)) byName.set(k, cand);
    slotCount.set(cand.sortOrder, (slotCount.get(cand.sortOrder) || 0) + 1);
  }
  const bySlot = new Map();
  for (const cand of byName.values()) if (slotCount.get(cand.sortOrder) === 1) bySlot.set(cand.sortOrder, cand);

  let nextSort = dbCustomers.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0) + 1;
  const created = [];
  const renamed = new Map(); // id → { id, slot, dbName, names:[{name, from, to}] }
  const perSheet = new Map();
  const problems = [];
  const last = new Map(); // id → { via, name } — اس گاہک کا آخری بار نام کیسے ملا

  for (const sheet of sheets) {
    const claimed = new Set();
    const out = sheet.rows.map((row) => ({ row, cand: null, via: null }));

    /* ۱) نام سے */
    out.forEach((o) => {
      const cand = byName.get(nameKey(o.row.name));
      if (cand && !claimed.has(cand.id)) {
        claimed.add(cand.id);
        o.cand = cand;
        o.via = 'name';
      }
    });

    /* ۲) لائن نمبر سے */
    out.forEach((o) => {
      if (o.cand) return;
      const cand = bySlot.get(o.row.slot);
      if (cand && !cand.isNew && !claimed.has(cand.id)) {
        claimed.add(cand.id);
        o.cand = cand;
        o.via = 'slot';
        let rec = renamed.get(cand.id);
        if (!rec) {
          rec = { id: cand.id, slot: o.row.slot, dbName: cand.name, names: [] };
          renamed.set(cand.id, rec);
        }
        const nm = normText(o.row.name);
        const hit = rec.names.find((n) => n.name === nm);
        if (hit) hit.to = sheet.date;
        else rec.names.push({ name: nm, from: sheet.date, to: sheet.date });
      }
    });

    /* ۳) نیا گاہک */
    out.forEach((o) => {
      if (o.cand) return;
      const k = nameKey(o.row.name);
      let cand = byName.get(k);
      if (cand && claimed.has(cand.id)) {
        problems.push(`${sheet.date}: نام «${o.row.name}» ایک ہی شیٹ میں دو بار ہے — دوسری لائن چھوڑ دی گئی`);
        return;
      }
      if (!cand) {
        cand = {
          id: `new:${k}`,
          name: normText(o.row.name),
          sortOrder: nextSort,
          isNew: true,
          openingBalance: o.row.prevExcel || 0,
          openingDate: dayBefore(sheet.date),
          firstDate: sheet.date,
          slot: o.row.slot,
        };
        nextSort += 1;
        byName.set(k, cand);
        created.push(cand);
      }
      claimed.add(cand.id);
      o.cand = cand;
      o.via = 'new';
    });

    out.forEach((o) => {
      if (o.cand) last.set(o.cand.id, { via: o.via, name: normText(o.row.name) });
    });
    perSheet.set(sheet.date, out);
  }

  /* finalName: صرف تب جب آخری شیٹ میں بھی گاہک نئے نام سے آیا ہو
     (کسی ایک دن کا عارضی نام ڈیٹابیس کا نام نہیں بدلتا) */
  const renamedList = [...renamed.values()].map((r) => {
    const l = last.get(r.id);
    return { ...r, finalName: l && l.via === 'slot' ? l.name : null };
  });

  return { perSheet, created, renamed: renamedList, problems };
}

/**
 * فائل کی لائنوں میں سے وہ الگ کرتا ہے جو پہلے سے موجود ہیں۔
 * «گنتی» کے حساب سے: اگر فائل میں ایک جیسی 2 لائنیں ہیں اور ڈیٹابیس میں 1،
 * تو صرف 1 نئی شمار ہوگی — اس طرح اصلی (جائز) دہرائی لائنیں بھی بچتی ہیں اور
 * دوبارہ اپ لوڈ پر کچھ دوگنا بھی نہیں ہوتا۔
 */
function multisetDiff(fileRows, existingRows, keyFn) {
  const counts = new Map();
  for (const r of existingRows) {
    const k = keyFn(r);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const fresh = [];
  let duplicates = 0;
  for (const r of fileRows) {
    const k = keyFn(r);
    const left = counts.get(k) || 0;
    if (left > 0) {
      counts.set(k, left - 1);
      duplicates += 1;
    } else fresh.push(r);
  }
  return { fresh, duplicates };
}

/** خرید کا لیبل («عمران ٹنڈو آدم سے وزن لیا 068») → سپلائر */
function matchSupplier(label, suppliers) {
  const l = nameKey(label);
  const lc = compactKey(label);
  for (const s of suppliers) {
    const full = nameKey(s.name);
    const two = full.split(' ').slice(0, 2).join(' ');
    if (l.includes(full) || l.includes(two) || lc.includes(compactKey(s.name))) return s;
  }
  return null;
}

module.exports = { resolveCustomers, multisetDiff, matchSupplier, dayBefore };
