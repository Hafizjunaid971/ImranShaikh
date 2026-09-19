'use strict';
const mongoose = require('mongoose');

/* ------------------------------------------------------ BANK ACCOUNT ----- */
const bankAccountSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },   // MUHAMMAD ALI
    accountNo: { type: String, required: true, trim: true },
    bankName: { type: String, trim: true },                // BANK AL HABIB
    branch: { type: String, trim: true },                  // KARACHI 11-B NORTH KARACHI
    openingBalance: { type: Number, default: 0 },          // منفی بھی ہو سکتا ہے
    openingDate: { type: Date },
    currency: { type: String, default: 'PKR' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);
bankAccountSchema.index({ accountNo: 1, title: 1 }, { unique: true });

/* -------------------------------------------------- BANK TRANSACTION ----- */
/* Excel: تاریخ | حوالہ | جمع کرواے | نکالے | بقایہ */
const bankTxnSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true, index: true },
    date: { type: Date, required: true, index: true },
    serial: { type: Number, default: 0 },
    reference: { type: String, trim: true },              // حوالہ (تفصیل)
    deposit: { type: Number, default: 0 },                // جمع کرواے
    withdraw: { type: Number, default: 0 },               // نکالے
    balance: { type: Number, default: 0 },                // derived — running
    linkedCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    linkedSupplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    sourceSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'DailySheet' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
bankTxnSchema.index({ account: 1, date: 1, serial: 1 });

/* ---------------------------------------------- SUPPLIER TRANSACTION ----- */
/* Excel: تاریخ | گاڑی نمبر | وزن | ریٹ | رقم | پچھلا بیلنس | ٹوٹل | دیے | بقایہ */
const supplierTxnSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    date: { type: Date, required: true, index: true },
    vehicleNo: String,
    weight: { type: Number, default: 0 },           // C
    rate: { type: Number, default: 0 },             // D
    amount: { type: Number, default: 0 },           // E = C*D   (derived)
    previousBalance: { type: Number, default: 0 },  // F         (derived)
    total: { type: Number, default: 0 },            // G = E+F   (derived)
    paid: { type: Number, default: 0 },             // H  دیے
    balance: { type: Number, default: 0 },          // I = G-H   (derived)
    description: String,                            // تفصیل
    paymentMode: { type: String, enum: ['cash', 'bank', 'adjust', 'none'], default: 'none' },
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
    sourceSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'DailySheet' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
supplierTxnSchema.index({ supplier: 1, date: 1, createdAt: 1 });

/* ------------------------------------------------------ PARTY LEDGER ----- */
/* Excel «عمران شیخ» — تاریخ | رقم | ریکوری | ٹوٹل | خرچہ | حوالہ | بقایہ */
const partyLedgerSchema = new mongoose.Schema(
  {
    party: { type: String, required: true, trim: true, index: true },   // عمران شیخ
    date: { type: Date, required: true, index: true },
    serial: { type: Number, default: 0 },
    saleAmount: { type: Number, default: 0 },   // دن کی فروخت (حوالہ کے لیے)
    recoveryAmount: { type: Number, default: 0 },
    debit: { type: Number, default: 0 },        // D  ٹوٹل (جمع)
    credit: { type: Number, default: 0 },       // E  خرچہ (نکالا)
    reference: String,                          // F  حوالہ
    balance: { type: Number, default: 0 },      // G  (derived)
    sourceSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'DailySheet' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
partyLedgerSchema.index({ party: 1, date: 1, serial: 1 });

module.exports = {
  BankAccount: mongoose.model('BankAccount', bankAccountSchema),
  BankTransaction: mongoose.model('BankTransaction', bankTxnSchema),
  SupplierTransaction: mongoose.model('SupplierTransaction', supplierTxnSchema),
  PartyLedger: mongoose.model('PartyLedger', partyLedgerSchema),
};
