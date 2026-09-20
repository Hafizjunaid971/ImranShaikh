/**
 * SERVER — صرف مقامی ڈیویلپمنٹ کے لیے (`npm run dev` / `npm start`)۔
 * Vercel پر یہ فائل استعمال نہیں ہوتی — وہاں api/index.js چلتی ہے، جو اسی
 * src/app.js کو استعمال کرتی ہے مگر listen() کے بغیر (سرور لیس فنکشن کے طور پر)۔
 */
'use strict';
require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/murgi_ledger');
    app.listen(PORT, () => console.log(`🚀 API: http://localhost:${PORT}/api`));
  } catch (err) {
    console.error('❌ سرور اسٹارٹ نہیں ہو سکا:', err.message);
    process.exit(1);
  }
})();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
