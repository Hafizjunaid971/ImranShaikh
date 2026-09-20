/**
 * VERCEL SERVERLESS ENTRY POINT
 * -----------------------------------------------------------------------
 * Vercel اس فائل کو ہر HTTP درخواست پر چلاتا ہے۔ یہ صرف اتنا کرتی ہے:
 *   1) MongoDB کنکشن یقینی بنائے (پہلے سے جڑا ہو تو فوراً آگے بڑھے)
 *   2) درخواست Express ایپ (src/app.js) کو دے دے
 *
 * محلی (local) ڈیویلپمنٹ کے لیے یہ فائل استعمال نہیں ہوتی — وہاں src/server.js
 * چلتی ہے جو عام طریقے سے app.listen() کرتی ہے۔
 */
'use strict';
require('dotenv').config();

const app = require('../src/app');
const { connectDB } = require('../src/config/db');

module.exports = async (req, res) => {
  try {
    await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');
  } catch (err) {
    console.error('❌ DB کنکشن ناکام:', err.message);
    res.status(503).json({ ok: false, message: 'ڈیٹابیس سے رابطہ نہیں ہو سکا' });
    return;
  }
  return app(req, res);
};
