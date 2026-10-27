'use strict';
const router = require('express').Router();
const { body, param } = require('express-validator');
const { protect, allow, validate } = require('../middleware');

const auth = require('../controllers/authController');
const master = require('../controllers/masterController');
const daily = require('../controllers/dailySheetController');
const ledger = require('../controllers/ledgerController');
const report = require('../controllers/reportController');
const exportCtrl = require('../controllers/exportController');
const importCtrl = require('../controllers/importController');

/* ------------------------------------------------------------- health --- */
router.get('/health', (req, res) =>
  res.json({ ok: true, service: 'murgi-ledger-api', time: new Date().toISOString() })
);

/* --------------------------------------------------------------- auth --- */
router.post(
  '/auth/login',
  [body('username').notEmpty().withMessage('یوزر نیم ضروری ہے'), body('password').notEmpty().withMessage('پاس ورڈ ضروری ہے')],
  validate,
  auth.login
);
router.get('/auth/me', protect, auth.me);
router.post(
  '/auth/change-password',
  protect,
  [body('newPassword').isLength({ min: 6 }).withMessage('پاس ورڈ کم از کم 6 حروف کا ہو')],
  validate,
  auth.changePassword
);
router.get('/users', protect, allow('admin'), auth.listUsers);
router.post(
  '/users',
  protect,
  allow('admin'),
  [
    body('name').notEmpty(),
    body('username').isLength({ min: 3 }),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  auth.createUser
);
router.put('/users/:id', protect, allow('admin'), auth.updateUser);

/* ---------------------------------------------------------- customers --- */
router.get('/customers', protect, master.listCustomers);
router.post(
  '/customers',
  protect,
  allow('admin', 'manager'),
  [body('name').notEmpty().withMessage('نام ضروری ہے')],
  validate,
  master.createCustomer
);
router.put('/customers/:id', protect, allow('admin', 'manager'), master.updateCustomer);
router.delete('/customers/:id', protect, allow('admin'), master.deleteCustomer);

/* ---------------------------------------------------------- suppliers --- */
router.get('/suppliers', protect, master.listSuppliers);
router.post('/suppliers', protect, allow('admin', 'manager'), [body('name').notEmpty()], validate, master.createSupplier);
router.put('/suppliers/:id', protect, allow('admin', 'manager'), master.updateSupplier);

/* ------------------------------------------------------ expense heads --- */
router.get('/expense-heads', protect, master.listExpenseHeads);
router.post('/expense-heads', protect, allow('admin', 'manager'), [body('name').notEmpty()], validate, master.createExpenseHead);
router.put('/expense-heads/:id', protect, allow('admin', 'manager'), master.updateExpenseHead);

/* ------------------------------------------------------ bank accounts --- */
router.get('/bank-accounts', protect, master.listBankAccounts);
router.post(
  '/bank-accounts',
  protect,
  allow('admin', 'manager'),
  [body('title').notEmpty(), body('accountNo').notEmpty()],
  validate,
  master.createBankAccount
);
router.put('/bank-accounts/:id', protect, allow('admin', 'manager'), master.updateBankAccount);

/* ----------------------------------------------------------- settings --- */
router.get('/settings', protect, master.getSettings);
router.put('/settings/:key', protect, allow('admin'), master.updateSetting);

/* -------------------------------------------------------- daily sheet --- */
router.get('/daily', protect, daily.list);
router.post('/daily/preview', protect, daily.preview);
router.get('/daily/:date', protect, daily.getByDate);
router.post(
  '/daily',
  protect,
  allow('admin', 'manager', 'operator'),
  [body('date').notEmpty().withMessage('تاریخ ضروری ہے')],
  validate,
  daily.save
);
router.patch('/daily/:date/lock', protect, allow('admin', 'manager'), daily.setLock);
router.post('/daily/:date/post', protect, allow('admin', 'manager'), daily.postToLedgers);
router.delete('/daily/:date', protect, allow('admin'), daily.remove);

/* ------------------------------------------------------------ ledgers --- */
router.get('/ledger/customers/balances', protect, ledger.customerBalances);
router.get('/ledger/customer/:id', protect, ledger.customerLedger);

router.get('/ledger/supplier/:id', protect, ledger.supplierLedger);
router.post('/ledger/supplier/:id', protect, allow('admin', 'manager', 'operator'), ledger.addSupplierTxn);
router.put('/ledger/supplier/:id/:txnId', protect, allow('admin', 'manager'), ledger.updateSupplierTxn);
router.delete('/ledger/supplier/:id/:txnId', protect, allow('admin'), ledger.deleteSupplierTxn);

router.get('/ledger/bank/:id', protect, ledger.bankLedger);
router.post('/ledger/bank/:id', protect, allow('admin', 'manager', 'operator'), ledger.addBankTxn);
router.put('/ledger/bank/:id/:txnId', protect, allow('admin', 'manager'), ledger.updateBankTxn);
router.delete('/ledger/bank/:id/:txnId', protect, allow('admin'), ledger.deleteBankTxn);

router.get('/ledger/parties', protect, ledger.partyList);
router.get('/ledger/party/:party', protect, ledger.partyLedger);
router.post('/ledger/party/:party', protect, allow('admin', 'manager', 'operator'), ledger.addPartyTxn);
router.put('/ledger/party/:party/:txnId', protect, allow('admin', 'manager'), ledger.updatePartyTxn);
router.delete('/ledger/party/:party/:txnId', protect, allow('admin'), ledger.deletePartyTxn);

/* ------------------------------------------------------------ reports --- */
router.get('/reports/dashboard', protect, report.dashboard);
router.get('/reports/profit', protect, report.profitReport);
router.get('/reports/recovery', protect, report.recoveryReport);
router.get('/reports/expenses', protect, report.expenseReport);
router.get('/reports/suppliers', protect, report.supplierSummary);
router.get('/reports/day-comparison', protect, report.dayComparison);

/* -------------------------------------------------------------- export --- */
router.get('/export/excel', protect, exportCtrl.exportExcel);

/* -------------------------------------------------------------- import --- */
/* Excel فائل (base64 JSON) → preview دیکھیں → commit سے صرف نیا ڈیٹا ڈیٹابیس میں */
router.post('/import/preview', protect, allow('admin', 'manager'), importCtrl.preview);
router.post('/import/commit', protect, allow('admin', 'manager'), importCtrl.commit);

module.exports = router;
