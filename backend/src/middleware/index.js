'use strict';
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { User } = require('../models/Master');

/** async controller wrapper — try/catch ہر جگہ لکھنے سے بچاتا ہے */
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** JWT سے یوزر نکالتا ہے */
const protect = asyncH(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('لاگ اِن ضروری ہے', 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('سیشن ختم ہو گیا، دوبارہ لاگ اِن کریں', 401);
  }

  const user = await User.findById(payload.id);
  if (!user || !user.isActive) throw new AppError('یوزر غیر فعال ہے', 401);
  req.user = user;
  next();
});

/** رول کی جانچ: allow('admin','manager') */
const allow =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('اس کام کی اجازت نہیں', 403));
    }
    next();
  };

/** express-validator کے نتائج */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      ok: false,
      message: 'ڈیٹا درست نہیں',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const notFound = (req, res) =>
  res.status(404).json({ ok: false, message: `راستہ نہیں ملا: ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'سرور میں مسئلہ';

  if (err.name === 'ValidationError') {
    status = 422;
    message = Object.values(err.errors).map((e) => e.message).join('، ');
  }
  if (err.code === 11000) {
    status = 409;
    message = `یہ اندراج پہلے سے موجود ہے (${Object.keys(err.keyValue || {}).join(', ')})`;
  }
  if (err.name === 'CastError') {
    status = 400;
    message = 'غلط ID';
  }

  if (process.env.NODE_ENV !== 'production' && status === 500) console.error(err);

  res.status(status).json({
    ok: false,
    message,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
};

module.exports = { asyncH, AppError, protect, allow, validate, notFound, errorHandler };
