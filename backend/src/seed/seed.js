/**
 * SEED — لیجر_ستمبر_2026_کراچی.xlsx کا اصل ڈیٹا ڈیٹابیس میں ڈالتا ہے۔
 * چلانے کا طریقہ:  npm run seed            (پرانا ڈیٹا رہنے دیتا ہے)
 *                  npm run seed -- --fresh (سب مٹا کر نئے سرے سے)
 */
'use strict';
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { User, Customer, Supplier, ExpenseHead, Setting } = require('../models/Master');
const { BankAccount, BankTransaction, SupplierTransaction, PartyLedger } = require('../models/Ledgers');
const DailySheet = require('../models/DailySheet');
const { recomputeSheet, recalcBank, recalcSupplier, recalcParty } = require('../utils/recalc');
const F = require('../utils/formulas');
const data = require('./seedData.json');
const ledgers = require('./ledgersData.json');

const FRESH = process.argv.includes('--fresh');
const d = (s) => new Date(`${s}T00:00:00.000Z`);

/* سپلائر — Excel کے rows 71..76 کے لیبل */
const SUPPLIERS = [
  { name: 'عمران ٹنڈو آدم', kind: 'aarti', city: 'ٹنڈو آدم', vehicleNo: '068', openingBalance: 278602, sortOrder: 1 },
  { name: 'مٹو آڑتی', kind: 'aarti', city: 'کراچی', sortOrder: 2 },
  { name: 'سکندر آڑتی', kind: 'aarti', city: 'کراچی', sortOrder: 3 },
  { name: 'وحید بلوچ آڑتی', kind: 'aarti', city: 'کراچی', openingBalance: 6991.6, sortOrder: 4 },
  { name: 'کراچی علی بفرزن', kind: 'farm', city: 'کراچی', sortOrder: 5 },
  { name: 'حیدرآباد فیصل بڈے', kind: 'aarti', city: 'حیدرآباد', sortOrder: 6 },
  { name: 'فیصل آڑتی', kind: 'aarti', city: 'کراچی', sortOrder: 7 },
];

/* خرچے کے مد — Excel A82 = 57600+3000+350+200 والی تقسیم */
const EXPENSE_HEADS = [
  { name: 'مزدا سپلائ خرچہ', defaultAmount: 0, sortOrder: 1 },
  { name: 'لیبر خرچہ', defaultAmount: 3000, sortOrder: 2 },
  { name: 'آفس چاۓ / رات پانی', defaultAmount: 350, sortOrder: 3 },
  { name: 'موٹرسائکل پیٹرول', defaultAmount: 200, sortOrder: 4 },
  { name: 'سوزکی کچرے کی گاڑی خرچہ', defaultAmount: 0, isDaily: false, sortOrder: 5 },
  { name: 'سوزکی رینگ پیٹرول', defaultAmount: 0, isDaily: false, sortOrder: 6 },
  { name: 'متفرق', defaultAmount: 0, isDaily: false, sortOrder: 7 },
];

const BANKS = [
  {
    title: 'MUHAMMAD ALI',
    accountNo: '1225-0981-001943-01-6',
    bankName: 'BANK AL HABIB',
    branch: 'KARACHI 11-B NORTH KARACHI',
    openingBalance: 1212456,
    openingDate: d('2026-08-31'),
    sortOrder: 1,
  },
];

const SETTINGS = [
  { key: 'legacyBalance_2026_07_31', value: 36678833, label: 'بیلنس 31-07-2026' },
  { key: 'legacyRecovery_2026_07_31', value: 1155400, label: 'ریکوری 31-07-2026' },
  { key: 'legacyBalance_2025_11_17', value: 31183966, label: 'بیلنس 17-11-2025' },
  { key: 'legacyDeductions', value: 1010000 + 2165742 + 127110 + 1000000, label: 'بیلنس میں سے کاٹے' },
  { key: 'businessName', value: 'کراچی مرغی سپلائی — لیجر', label: 'کاروبار کا نام' },
  { key: 'city', value: 'کراچی', label: 'شہر' },
];

async function run() {
  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');

  if (FRESH) {
    console.log('🧹 پرانا ڈیٹا صاف کیا جا رہا ہے…');
    await Promise.all([
      DailySheet.deleteMany({}),
      Customer.deleteMany({}),
      Supplier.deleteMany({}),
      ExpenseHead.deleteMany({}),
      Setting.deleteMany({}),
      BankAccount.deleteMany({}),
      BankTransaction.deleteMany({}),
      SupplierTransaction.deleteMany({}),
      PartyLedger.deleteMany({}),
      User.deleteMany({}),
    ]);
  }

  /* ---------------------------------------------------------- USERS ----- */
  if ((await User.countDocuments()) === 0) {
    const admin = new User({ name: 'ایڈمن', username: 'admin', role: 'admin' });
    await admin.setPassword(process.env.SEED_ADMIN_PASSWORD || 'admin123');
    await admin.save();

    const op = new User({ name: 'منشی', username: 'munshi', role: 'operator' });
    await op.setPassword('munshi123');
    await op.save();
    console.log('👤 یوزر بنے: admin / admin123 ، munshi / munshi123');
  }

  /* ------------------------------------------------------ MASTERS ------- */
  for (const s of SETTINGS) await Setting.findOneAndUpdate({ key: s.key }, s, { upsert: true });
  for (const s of SUPPLIERS) await Supplier.findOneAndUpdate({ name: s.name }, s, { upsert: true });
  for (const e of EXPENSE_HEADS) await ExpenseHead.findOneAndUpdate({ name: e.name }, e, { upsert: true });
  for (const b of BANKS)
    await BankAccount.findOneAndUpdate({ accountNo: b.accountNo, title: b.title }, b, { upsert: true });
  console.log(`🏷️  ماسٹر ڈیٹا: ${SUPPLIERS.length} سپلائر، ${EXPENSE_HEADS.length} خرچہ مد، ${BANKS.length} بینک`);

  /* ---------------------------------------------------- CUSTOMERS ------- */
  for (const c of data.customers) {
    await Customer.findOneAndUpdate(
      { name: c.name },
      { name: c.name, openingBalance: c.openingBalance, openingDate: d('2026-08-31'), sortOrder: c.sortOrder },
      { upsert: true }
    );
  }
  const customers = await Customer.find().lean();
  const cMap = new Map(customers.map((c) => [c.name, c]));
  console.log(`👥 گاہک: ${customers.length}`);

  const suppliers = await Supplier.find().lean();
  const sMap = new Map(suppliers.map((s) => [s.name, s]));
  const heads = await ExpenseHead.find().sort({ sortOrder: 1 }).lean();

  /* سپلائر کا لیبل Excel میں لمبا جملہ تھا — اسے اصل نام سے جوڑتے ہیں */
  const matchSupplier = (label = '') => {
    const l = label.replace(/\s+/g, ' ');
    for (const s of suppliers) {
      const key = s.name.split(' ').slice(0, 2).join(' ');
      if (l.includes(key) || l.includes(s.name)) return s;
    }
    return null;
  };

  /* -------------------------------------------------- DAILY SHEETS ------ */
  const admin = await User.findOne({ role: 'admin' }).lean();

  for (const s of data.sheets) {
    const date = d(s.date);
    let sheet = await DailySheet.findOne({ date });
    if (!sheet) sheet = new DailySheet({ date, createdBy: admin._id });

    sheet.entries = s.entries
      .filter((e) => cMap.has(e.name))
      .map((e) => {
        const c = cMap.get(e.name);
        return {
          customer: c._id,
          customerName: c.name,
          sortOrder: c.sortOrder,
          loads: (e.loads || []).map((w) => ({ weight: F.num(w) })),
          weight: F.num((e.loads || []).reduce((t, w) => t + F.num(w), 0)),
          rate: F.num(e.rate),
          recoveries: (e.recoveries || []).map((a) => ({ amount: F.num(a), mode: 'cash' })),
        };
      });

    sheet.purchases = (s.purchases || []).map((p) => {
      const sup = matchSupplier(p.supplier);
      return {
        supplier: sup ? sup._id : undefined,
        supplierName: sup ? sup.name : p.supplier,
        vehicleNo: sup ? sup.vehicleNo : '',
        weight: F.num(p.weight),
        rate: F.num(p.rate),
      };
    });

    /* Excel A82 کی ترتیب: مزدا خرچہ + لیبر + چاۓ + پیٹرول */
    sheet.expenses = (s.expenses || []).map((amt, i) => ({
      head: heads[i] ? heads[i]._id : undefined,
      headName: heads[i] ? heads[i].name : 'متفرق',
      amount: F.num(amt),
    }));

    /* کوسٹنگ: Excel میں جو بنیادی ریٹ استعمال ہوئی وہی، ورنہ سب سے بڑی خرید کی ریٹ */
    const biggest = [...sheet.purchases].sort((a, b) => b.weight - a.weight)[0];
    sheet.costing = {
      baseRate: F.num(s.costing?.baseRate) || (biggest ? biggest.rate : 0),
      shortWeight: null,
      manualShortValue:
        s.costing && s.costing.manualShortValue !== null && s.costing.manualShortValue !== undefined
          ? F.num(s.costing.manualShortValue)
          : null,
    };

    await recomputeSheet(sheet, { fillPrevious: true });
    await sheet.save();
    console.log(
      `📄 ${s.date}  وزن ${sheet.totals.weight}  فروخت ${sheet.totals.amount}  صافی بچت ${sheet.totals.netProfit}`
    );
  }

  /* ---------------------------------------------- REAL LEDGER DATA ------ */
  /* بینک، پارٹی اور دونوں سپلائر کھاتوں کی اصل تفصیل Excel کی الگ الگ شیٹوں
     (بینک الحبیب، عمران شیخ، عمران ٹنڈوآدم، وحید بلوچ آڑتی) سے نکالی گئی —
     یہ روزانہ شیٹ سے اندازہ لگا کر نہیں بنائی گئی، عین وہی اندراج ہیں۔ */

  // --- بینک ٹرانزیکشنز ---
  const bankAcc = await BankAccount.findOne({ accountNo: ledgers.bank.accountNo }).lean();
  if (bankAcc && (await BankTransaction.countDocuments({ account: bankAcc._id })) === 0) {
    let serial = 1;
    await BankTransaction.insertMany(
      ledgers.bank.rows.map((r) => ({
        account: bankAcc._id,
        date: d(r.date),
        serial: serial++,
        reference: r.reference,
        deposit: F.num(r.deposit),
        withdraw: F.num(r.withdraw),
        createdBy: admin._id,
      }))
    );
    await recalcBank(bankAcc._id, ledgers.bank.openingBalance);
    console.log(`🏦 بینک کھاتہ: ${ledgers.bank.rows.length} اندراج`);
  }

  // --- پارٹی لیجر (عمران شیخ) ---
  if ((await PartyLedger.countDocuments({ party: ledgers.party.name })) === 0) {
    let serial = 1;
    await PartyLedger.insertMany(
      ledgers.party.rows.map((r) => ({
        party: ledgers.party.name,
        date: d(r.date),
        serial: serial++,
        saleAmount: F.num(r.saleAmount),
        recoveryAmount: F.num(r.recoveryAmount),
        debit: F.num(r.debit),
        credit: F.num(r.credit),
        reference: r.reference,
        createdBy: admin._id,
      }))
    );
    await recalcParty(ledgers.party.name, 0);
    console.log(`📘 پارٹی لیجر «${ledgers.party.name}»: ${ledgers.party.rows.length} اندراج`);
  }

  // --- سپلائر لیجر (عمران ٹنڈوآدم، وحید بلوچ آڑتی) ---
  for (const key of ['tandoAdam', 'wahidBaloch']) {
    const src = ledgers.suppliers[key];
    const sup = await Supplier.findOne({ name: src.name }).lean();
    if (!sup) continue;
    if ((await SupplierTransaction.countDocuments({ supplier: sup._id })) === 0) {
      await SupplierTransaction.insertMany(
        src.rows.map((r) => ({
          supplier: sup._id,
          date: d(r.date),
          vehicleNo: r.vehicleNo,
          weight: F.num(r.weight),
          rate: F.num(r.rate),
          paid: F.num(r.paid),
          description: r.description,
          createdBy: admin._id,
        }))
      );
      await recalcSupplier(sup._id, src.openingBalance);
      console.log(`🚚 سپلائر «${src.name}»: ${src.rows.length} اندراج`);
    }
  }

  console.log('\n✅ سیڈنگ مکمل۔ اب `npm run verify` چلا کر فارمولے Excel سے ملا لیں۔');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('❌ سیڈنگ ناکام:', e);
  process.exit(1);
});
