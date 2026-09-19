'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/* -------------------------------------------------------------- USER ----- */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'operator' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};
userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/* ---------------------------------------------------------- CUSTOMER ----- */
/* گاہک — روزانہ شیٹ کی ہر لائن ایک گاہک ہے */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, index: true },
    area: { type: String, trim: true },       // 3 نمبر، 11-ایف، ناگن وغیرہ
    phone: { type: String, trim: true },
    openingBalance: { type: Number, default: 0 },   // 31-08-2026 کا بقایہ
    openingDate: { type: Date },
    sortOrder: { type: Number, default: 0 },        // شیٹ میں ترتیب (Excel row)
    isActive: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true }
);
customerSchema.index({ name: 1 }, { unique: true });
customerSchema.index({ sortOrder: 1 });

/* ---------------------------------------------------------- SUPPLIER ----- */
/* سپلائر / آڑتی / کمیشن ایجنٹ */
const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    kind: {
      type: String,
      enum: ['aarti', 'farm', 'cargo', 'partner', 'other'],
      default: 'aarti',
    },
    city: { type: String, trim: true },
    phone: String,
    vehicleNo: String,                  // مستقل گاڑی نمبر (068 / 661 وغیرہ)
    openingBalance: { type: Number, default: 0 },
    openingDate: Date,
    showInDailySheet: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ------------------------------------------------------- EXPENSE HEAD ---- */
const expenseHeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    defaultAmount: { type: Number, default: 0 },
    isDaily: { type: Boolean, default: true },   // ہر روز شیٹ میں خودکار آئے
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------- SETTINGS ----- */
/* Excel کی rows 69/70 والی مستقل قدریں + کاروباری ترجیحات */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed,
    label: String,
  },
  { timestamps: true }
);

module.exports = {
  User: mongoose.model('User', userSchema),
  Customer: mongoose.model('Customer', customerSchema),
  Supplier: mongoose.model('Supplier', supplierSchema),
  ExpenseHead: mongoose.model('ExpenseHead', expenseHeadSchema),
  Setting: mongoose.model('Setting', settingSchema),
};
