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
// 'use strict';
// require('dotenv').config();

// const app = require('../src/app');
// const { connectDB } = require('../src/config/db');

// module.exports = async (req, res) => {
//   try {
//     await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');
//   } catch (err) {
//     console.error('❌ DB کنکشن ناکام:', err.message);
//     res.status(503).json({ ok: false, message: 'ڈیٹابیس سے رابطہ نہیں ہو سکا' });
//     return;
//   }
//   return app(req, res);
// };

// 'use strict';

// const app = require('../src/app');
// const { connectDB } = require('../src/config/db');

// module.exports = async (req, res) => {
//   try {
//     // 1. Verify MONGO_URI is present in production/serverless environment
//     if (!process.env.MONGO_URI) {
//       console.error('❌ MONGO_URI environment variable is missing on Vercel!');
//       return res.status(500).json({
//         ok: false,
//         message: 'سرور کنفیگریشن کی خرابی: MONGO_URI موجود نہیں ہے',
//       });
//     }

//     // 2. Await DB connection without falling back to localhost on Vercel
//     await connectDB(process.env.MONGO_URI);
    
//     // 3. Delegate request to Express app
//     return app(req, res);
//   } catch (err) {
//     console.error('❌ DB کنکشن ناکام:', err.message);
//     return res.status(503).json({ 
//       ok: false, 
//       message: 'ڈیٹابیس سے رابطہ نہیں ہو سکا',
//       error: process.env.NODE_ENV !== 'production' ? err.message : undefined
//     });
//   }
// };

'use strict';
require('dotenv').config();

const { connectDB } = require('../src/config/db');

module.exports = async (req, res) => {
  try {
    // 1. Pehle MongoDB connection establish hone ka AWAIT karein
    if (process.env.MONGO_URI) {
      await connectDB(process.env.MONGO_URI);
    } else {
      console.error('❌ MONGO_URI missing on Vercel Environment Variables');
    }

    // 2. Connection success hone ke baad App require/call karein
    const app = require('../src/app');
    return app(req, res);
  } catch (err) {
    console.error('❌ Vercel DB Connection Error:', err.message);
    return res.status(500).json({ 
      ok: false, 
      message: 'ڈیٹا بیس کنکشن قائم نہیں ہو سکا',
      error: err.message 
    });
  }
};