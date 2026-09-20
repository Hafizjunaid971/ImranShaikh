// /**
//  * APP — Express ایپ کی مکمل تشکیل، لیکن سرور شروع (listen) نہیں کرتی۔
//  * یہ فائل دو جگہ استعمال ہوتی ہے:
//  *   1) src/server.js       — مقامی ڈیویلپمنٹ (npm run dev / npm start)
//  *   2) api/index.js         — Vercel سرور لیس فنکشن
//  * دونوں جگہ ایک ہی app چلے، اسی لیے listen() کو الگ رکھا گیا ہے۔
//  */
// 'use strict';

// const express = require('express');
// const cors = require('cors');
// const helmet = require('helmet');
// const morgan = require('morgan');
// const compression = require('compression');
// const rateLimit = require('express-rate-limit');

// const routes = require('./routes');
// const { notFound, errorHandler } = require('./middleware');

// const app = express();

// app.use(helmet());
// app.use(compression());
// app.use(
//   cors({
//     origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','),
//     credentials: true,
//   })
// );
// app.use(express.json({ limit: '2mb' }));
// app.use(express.urlencoded({ extended: true }));
// if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// app.use(
//   '/api',
//   rateLimit({
//     windowMs: 60 * 1000,
//     max: Number(process.env.RATE_LIMIT || 300),
//     standardHeaders: true,
//     legacyHeaders: false,
//     message: { ok: false, message: 'بہت زیادہ درخواستیں — تھوڑی دیر بعد کوشش کریں' },
//   })
// );

// app.use('/api', routes);
// app.get('/', (req, res) => res.json({ ok: true, message: 'مرغی لیجر API چل رہا ہے' }));

// app.use(notFound);
// app.use(errorHandler);

// module.exports = app;


/**
 * APP — Express ایپ کی مکمل تشکیل، لیکن سرور شروع (listen) نہیں کرتی۔
 * یہ فائل دو جگہ استعمال ہوتی ہے:
 *   1) src/server.js       — مقامی ڈیویلپمنٹ (npm run dev / npm start)
 *   2) api/index.js        — Vercel سرور لیس فنکشن
 * دونوں جگہ ایک ہی app چلے، اسی لیے listen() کو الگ رکھا گیا ہے۔
 */
'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware');

const app = express();

app.use(helmet());
app.use(compression());

// Clean origins without trailing slashes or paths
const defaultOrigins = [
  'https://karachi-poultry-supply21.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (defaultOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS Blocked for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Rate Limiter
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: 'بہت زیادہ درخواستیں — تھوڑی دیر بعد کوشش کریں' },
  })
);

// IMPORTANT: Direct routes mapped to '/' so /auth/login works without /api
app.use('/', routes);
app.use('/api', routes); // Safety fallback if frontend calls /api/auth/login

app.get('/', (req, res) => res.json({ ok: true, message: 'مرغی لیجر API چل رہا ہے' }));

app.use(notFound);
app.use(errorHandler);

module.exports = app;