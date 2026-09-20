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
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!cachedPromise) {
    mongoose.set('strictQuery', true);
    
    cachedPromise = mongoose
      .connect(uri, {
        bufferCommands: false, // <-- YAHAN ADD KAREIN (Queries queue hone ke bajaye instantly error throw karegi)
        autoIndex: true,
        serverSelectionTimeoutMS: 5000, // Timeout ko 15s se kam karke 5s kar dein
        maxPoolSize: 10,
      })
      .then((conn) => {
        console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }

  return cachedPromise;
}

module.exports = { connectDB };