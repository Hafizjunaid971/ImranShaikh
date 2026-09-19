'use strict';
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware');

const app = express();

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','),
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: 'بہت زیادہ درخواستیں — تھوڑی دیر بعد کوشش کریں' },
  })
);

app.use('/api', routes);
app.get('/', (req, res) => res.json({ ok: true, message: 'مرغی لیجر API چل رہا ہے' }));

app.use(notFound);
app.use(errorHandler);

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

module.exports = app;
