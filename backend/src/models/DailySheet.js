'use strict';
const mongoose = require('mongoose');

/* ایک گاہک کی ریکوری کی ایک قسط — Excel میں H4 = 100000+25000+8000 */
const recoverySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, default: 0 },
    mode: { type: String, enum: ['cash', 'bank', 'easypaisa', 'adjust'], default: 'cash' },
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
    note: String,
  },
  { _id: true }
);

/* ایک دن میں ایک سے زیادہ لوڈ — Excel میں B4 = 931.7+222.5 */
const loadSchema = new mongoose.Schema(
  {
    weight: { type: Number, required: true, default: 0 },
    vehicleNo: String,
    note: String,
  },
  { _id: true }
);

/* روزانہ شیٹ کی ایک لائن (Excel rows 4..66) */
const entrySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,            // denormalised: پرانی شیٹ کا نام محفوظ رہے
    sortOrder: { type: Number, default: 0 },

    /* --- INPUTS --- */
    loads: [loadSchema],                            // B کی تفصیل (کئی لوڈ)
    weight: { type: Number, default: 0 },           // B  وزن = sum(loads) یا سیدھا
    rate: { type: Number, default: 0 },             // C  ریٹ
    recoveries: [recoverySchema],                   // H  کی تفصیل

    /* --- DERIVED (formulas.js سے، کلائنٹ سے کبھی نہیں) --- */
    amount: { type: Number, default: 0 },           // D = B*C
    previousBalance: { type: Number, default: 0 },  // E = پچھلے دن کا I
    totalAmount: { type: Number, default: 0 },      // F = D+E
    recovery: { type: Number, default: 0 },         // H = sum(recoveries)
    closingBalance: { type: Number, default: 0 },   // I = F-H

    note: String,
  },
  { _id: true }
);

/* خرید / سپلائی بلاک (Excel rows 71..76) */
const purchaseSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: String,
    vehicleNo: String,
    weight: { type: Number, default: 0 },   // D
    rate: { type: Number, default: 0 },     // C
    amount: { type: Number, default: 0 },   // A = C*D  (derived)
    note: String,
  },
  { _id: true }
);

/* خرچے (Excel A82) */
const expenseSchema = new mongoose.Schema(
  {
    head: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseHead' },
    headName: String,
    amount: { type: Number, default: 0 },
    note: String,
  },
  { _id: true }
);

const dailySheetSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    title: { type: String, default: 'DAILY SHEET' },

    entries: [entrySchema],
    purchases: [purchaseSchema],
    expenses: [expenseSchema],

    /* کوسٹنگ بلاک (G72..G76) — یوزر صرف baseRate / shortWeight دیتا ہے */
    costing: {
      baseRate: { type: Number, default: 0 },
      shortWeight: { type: Number, default: null },
      manualShortValue: { type: Number, default: null },
      shortValue: { type: Number, default: 0 },     // G72
      totalCosting: { type: Number, default: 0 },   // G74
      perKg: { type: Number, default: 0 },          // G75
      costingRate: { type: Number, default: 0 },    // G76
    },

    /* شیٹ کے ٹوٹل (row 67 + rows 77..83) — سب derived */
    totals: {
      weight: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      previousBalance: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      recovery: { type: Number, default: 0 },
      closingBalance: { type: Number, default: 0 },
      avgRate: { type: Number, default: 0 },
      activeParties: { type: Number, default: 0 },
      purchaseWeight: { type: Number, default: 0 },
      purchaseAmount: { type: Number, default: 0 },
      purchaseAvgRate: { type: Number, default: 0 },
      excessShort: { type: Number, default: 0 },
      excessShortLabel: String,
      expenseTotal: { type: Number, default: 0 },
      grossProfit: { type: Number, default: 0 },
      netProfit: { type: Number, default: 0 },
      profitPerKg: { type: Number, default: 0 },
    },

    isLocked: { type: Boolean, default: false },   // بند شیٹ میں ترمیم نہیں
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

dailySheetSchema.index({ date: -1 });
dailySheetSchema.index({ 'entries.customer': 1, date: -1 });

module.exports = mongoose.model('DailySheet', dailySheetSchema);
