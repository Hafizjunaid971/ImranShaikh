/**
 * DB CONNECTION — سرور لیس ماحول (Vercel) کے لیے خاص طور پر کیش شدہ۔
 *
 * عام (ہمیشہ چلتے) سرور میں connectDB ایک بار چلتی ہے اور بس۔ لیکن Vercel پر
 * ہر HTTP درخواست ایک نئے یا «گرم» (warm) function invocation میں آ سکتی ہے —
 * اگر ہر بار نئی connection بنائی جائے تو چند ہی درخواستوں میں MongoDB Atlas
 * "too many connections" دے دیتا ہے۔ اس لیے connection promise کو module-level
 * پر یاد رکھا جاتا ہے — «گرم» invocation میں وہی پرانی connection دوبارہ ملتی ہے۔
 */
'use strict';
const mongoose = require('mongoose');

let cachedPromise = null;

async function connectDB(uri) {
  // پہلے سے جڑا ہو تو دوبارہ کوشش نہ کریں
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!cachedPromise) {
    mongoose.set('strictQuery', true);
    cachedPromise = mongoose
      .connect(uri, {
        autoIndex: true,
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: 10, // سرور لیس میں کم رکھیں — ہر instance کی اپنی pool ہوتی ہے
      })
      .then((conn) => {
        console.log(`✅ MongoDB جُڑ گیا: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch((err) => {
        cachedPromise = null; // ناکامی پر کیش صاف کریں تاکہ اگلی درخواست دوبارہ کوشش کرے
        throw err;
      });
  }

  return cachedPromise;
}

module.exports = { connectDB };
