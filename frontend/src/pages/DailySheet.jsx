import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, fmtMoney, fmtNum, today } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

function Cell({ value, onChange, disabled, width = 90, step = 'any', title }) {
  return (
    <input
      className="cell num"
      type="number"
      step={step}
      title={title}
      style={{ width }}
      disabled={disabled}
      value={value === 0 || value === null || value === undefined ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
    />
  );
}

/** «100000+25000+8000» جیسی سٹرنگ کو قسطوں میں بدلتا ہے (Excel کی عادت) */
const parsePlus = (str) =>
  String(str || '')
    .split('+')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);

const joinPlus = (arr = []) => arr.map((x) => x.weight ?? x.amount ?? x).filter(Boolean).join('+');
const SHOP_NAME = 'Shoaib Enter Price';
const SHOP_PHONE = '+92 315 8957767';

/** from..to ke darmiyan har din ki date string (yyyy-mm-dd) ki list */
const dateRangeList = (from, to) => {
  const list = [];
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    list.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return list;
};

export default function DailySheet() {
  const { t } = useLang();
  const { date: routeDate } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { toast, show, clear } = useToast();

  const [date, setDate] = useState(routeDate || today());
  const [sheet, setSheet] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [heads, setHeads] = useState([]);
  const [totals, setTotals] = useState(null);
  const [costing, setCosting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [filter, setFilter] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);

  // --- Range report / print ---
  const [rangeFrom, setRangeFrom] = useState(routeDate || today());
  const [rangeTo, setRangeTo] = useState(routeDate || today());
  const [rangeCustomer, setRangeCustomer] = useState('');
  const [rangeLoading, setRangeLoading] = useState(false);

  // aaj ke loaded sheet se customer names ki list (name select/search ke liye)
  const customerOptions = sheet
    ? [...new Set(sheet.entries.map((e) => e.customerName).filter(Boolean))].sort()
    : [];

  const editable = can('admin', 'manager', 'operator') && !sheet?.isLocked;

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const [sh, sup, hd] = await Promise.all([
        api.get(`/daily/${d}`),
        api.get('/suppliers?active=true'),
        api.get('/expense-heads'),
      ]);
      setSuppliers(sup.data.data);
      setHeads(hd.data.data);
      setIsNew(sh.data.isNew);

      const s = sh.data.data;
      s.entries = s.entries.map((e) => ({
        ...e,
        customerId: e.customer?._id || e.customer,
        customerName: e.customerName || e.customer?.name,
        area: e.customer?.area,
        phone: e.phone || e.customer?.phone,
        loadsText: joinPlus(e.loads),
        recoveryText: joinPlus(e.recoveries),
      }));
      s.purchases = s.purchases.map((p) => ({
        ...p,
        supplierId: p.supplier?._id || p.supplier || '',
      }));
      setSheet(s);
      setTotals(s.totals);
      setCosting(s.costing);
    } catch (e) {
      show(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const timer = useRef(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const pick = (c) =>
    c
      ? {
          weight: c.weight,
          amount: c.amount,
          totalAmount: c.totalAmount,
          recovery: c.recovery,
          closingBalance: c.closingBalance,
        }
      : {};

  const inputKey = sheet
    ? JSON.stringify([
        sheet.entries.map((e) => [e.loadsText, e.rate, e.previousBalance, e.recoveryText]),
        sheet.purchases.map((p) => [p.weight, p.rate]),
        sheet.expenses.map((x) => x.amount),
        sheet.costing?.baseRate ?? null,
        sheet.costing?.shortWeight ?? null,
        sheet.costing?.manualShortValue ?? null,
      ])
    : '';

  useEffect(() => {
    if (!sheetRef.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const cur = sheetRef.current;
      if (!cur) return;
      const payload = {
        entries: cur.entries.map((e) => ({
          loads: parsePlus(e.loadsText).map((w) => ({ weight: w })),
          weight: parsePlus(e.loadsText).length ? 0 : e.weight,
          rate: e.rate,
          previousBalance: e.previousBalance,
          recoveries: parsePlus(e.recoveryText).map((a) => ({ amount: a })),
        })),
        purchases: cur.purchases.map((p) => ({ weight: p.weight, rate: p.rate })),
        expenses: cur.expenses.map((x) => ({ amount: x.amount })),
        costing: {
          baseRate: cur.costing?.baseRate,
          shortWeight: cur.costing?.shortWeight ?? null,
          manualShortValue: cur.costing?.manualShortValue ?? null,
        },
      };
      try {
        const { data } = await api.post('/daily/preview', payload);
        setTotals(data.data.totals);
        setCosting(data.data.costing);
        setSheet((prev) =>
          prev
            ? { ...prev, entries: prev.entries.map((e, i) => ({ ...e, ...pick(data.data.entries[i]) })) }
            : prev
        );
      } catch {
        /* خاموش — یوزر لکھتا رہے */
      }
    }, 400);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  const setEntry = (idx, patch) =>
    setSheet((s) => {
      const entries = [...s.entries];
      entries[idx] = { ...entries[idx], ...patch };
      return { ...s, entries };
    });

  const setPurchase = (idx, patch) =>
    setSheet((s) => {
      const purchases = [...s.purchases];
      purchases[idx] = { ...purchases[idx], ...patch };
      return { ...s, purchases };
    });

  const setExpense = (idx, patch) =>
    setSheet((s) => {
      const expenses = [...s.expenses];
      expenses[idx] = { ...expenses[idx], ...patch };
      return { ...s, expenses };
    });

  const addPurchaseRow = () =>
    setSheet((s) => ({
      ...s,
      purchases: [...s.purchases, { supplierId: '', supplierName: '', vehicleNo: '', weight: 0, rate: 0 }],
    }));

  const addExpenseRow = () =>
    setSheet((s) => ({ ...s, expenses: [...s.expenses, { head: '', headName: t('daily.misc'), amount: 0 }] }));

  const applyRateToAll = () => {
    const v = Number(prompt(t('daily.applyRatePrompt')));
    if (!Number.isFinite(v) || v <= 0) return;
    setSheet((s) => ({
      ...s,
      entries: s.entries.map((e) =>
        parsePlus(e.loadsText).length || e.weight ? { ...e, rate: v } : e
      ),
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        date,
        entries: sheet.entries.map((e) => ({
          customer: e.customerId,
          loads: parsePlus(e.loadsText).map((w) => ({ weight: w })),
          weight: parsePlus(e.loadsText).length ? 0 : e.weight,
          rate: e.rate,
          recoveries: parsePlus(e.recoveryText).map((a) => ({ amount: a, mode: 'cash' })),
          note: e.note,
        })),
        purchases: sheet.purchases
          .filter((p) => p.supplierId && (p.weight || p.rate))
          .map((p) => ({ supplier: p.supplierId, vehicleNo: p.vehicleNo, weight: p.weight, rate: p.rate })),
        expenses: sheet.expenses.map((x) => ({ head: x.head || undefined, headName: x.headName, amount: x.amount })),
        costing: sheet.costing,
      };
      const { data } = await api.post('/daily', body);
      show(data.message);
      setIsNew(false);
      await load(date);
    } catch (e) {
      show(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async () => {
    try {
      const { data } = await api.patch(`/daily/${date}/lock`, { isLocked: !sheet.isLocked });
      show(data.message);
      load(date);
    } catch (e) {
      show(errMsg(e), 'error');
    }
  };

  const postLedgers = async () => {
    try {
      const { data } = await api.post(`/daily/${date}/post`);
      show(`${data.message} — ${t('daily.supplier')} ${data.supplierEntries}، ${t('dashboard.bank')} ${data.bankEntries}`);
    } catch (e) {
      show(errMsg(e), 'error');
    }
  };

  const printBill = (entry) => {
    const printWindow = window.open('', '_blank', 'width=420,height=650');
    if (!printWindow) {
      show('Please allow pop-ups to print the bill.', 'error');
      return;
    }

    const escapeHtml = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    printWindow.document.write(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(entry.customerName)}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; }
            body { width: 80mm; margin: 0; padding: 5mm; color: #111; font: 13px Arial, sans-serif; }
            h1 { margin: 0 0 2px; text-align: center; font-size: 18px; }
            .meta { text-align: center; color: #555; font-size: 11px; margin-bottom: 10px; }
            .line { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px dashed #999; }
            .label { color: #555; }
            .strong { font-weight: 700; font-size: 15px; }
            .total { border-top: 1px solid #111; margin-top: 4px; padding-top: 6px; }
            .footer { margin-top: 12px; text-align: center; font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(SHOP_NAME)}</h1>
          <div class="meta">${escapeHtml(SHOP_PHONE)}</div>
          <div class="meta">${escapeHtml(date)}${entry.area ? ` — ${escapeHtml(entry.area)}` : ''}</div>
          <div class="line strong"><span>${escapeHtml(t('daily.col.name'))}</span><span>${escapeHtml(entry.customerName)}</span></div>
          ${entry.phone ? `<div class="line"><span class="label">${escapeHtml(t('customers.phone'))}</span><span>${escapeHtml(entry.phone)}</span></div>` : ''}
          <div class="line"><span class="label">${escapeHtml(t('daily.col.weight'))}</span><span>${escapeHtml(fmtNum(entry.weight))}</span></div>
          <div class="line"><span class="label">${escapeHtml(t('daily.col.rate'))}</span><span>${escapeHtml(fmtMoney(entry.rate))}</span></div>
          <div class="line"><span class="label">${escapeHtml(t('daily.col.amount'))}</span><span>${escapeHtml(fmtMoney(entry.amount))}</span></div>
          <div class="line"><span class="label">${escapeHtml(t('daily.col.prevBalance'))}</span><span>${escapeHtml(fmtMoney(entry.previousBalance))}</span></div>
          <div class="line total strong"><span>${escapeHtml(t('daily.col.totalAmount'))}</span><span>${escapeHtml(fmtMoney(entry.totalAmount))}</span></div>
          <div class="line"><span class="label">${escapeHtml(t('daily.col.recovery'))}</span></div>
          <div class="line strong"><span>${escapeHtml(t('daily.col.newBalance'))}</span></div>
          <div class="footer">${escapeHtml(SHOP_NAME)} — ${escapeHtml(SHOP_PHONE)}</div>
          <script>window.onload = function () { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  /** Range Report: from..to ke har din ka /daily/:date data lekar ek combined print nikalta hai.
   *  Koi naya backend route nahi chahiye — maujooda per-day endpoint hi dohraya jata hai. */
  const printRangeReport = async () => {
    if (!rangeFrom || !rangeTo) {
      show('From aur To date select karein', 'error');
      return;
    }
    if (rangeFrom > rangeTo) {
      show('From date, To date se pehle honi chahiye', 'error');
      return;
    }

    setRangeLoading(true);
    try {
      const dates = dateRangeList(rangeFrom, rangeTo);
      const results = await Promise.all(
        dates.map((d) => api.get(`/daily/${d}`).catch(() => null))
      );

      const esc = (v) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const wantName = rangeCustomer.trim().toLowerCase();

      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        show('Please allow pop-ups to print the report.', 'error');
        return;
      }

      // ---- Ek customer ka naam diya gaya ho to sirf usi ka statement ----
      if (wantName) {
        const custRows = dates
          .map((d, i) => {
            const res = results[i];
            if (!res || res.data.isNew) return null;
            const entries = res.data.data?.entries || [];
            const match = entries.find(
              (e) => (e.customerName || e.customer?.name || '').toLowerCase() === wantName
            );
            if (!match) return null;
            return { date: d, e: match };
          })
          .filter(Boolean);

        if (!custRows.length) {
          show('Is naam ka record is range mein nahi mila', 'error');
          printWindow.close();
          return;
        }

        const first = custRows[0].e;
        const custDisplayName = first.customerName || first.customer?.name || rangeCustomer;
        const area = first.customer?.area || first.area;
        const phone = first.phone || first.customer?.phone;

        const grand = custRows.reduce(
          (acc, r) => {
            acc.weight += Number(r.e.weight || 0);
            acc.amount += Number(r.e.amount || 0);
            acc.recovery += Number(r.e.recovery || 0);
            return acc;
          },
          { weight: 0, amount: 0, recovery: 0 }
        );
        const finalClosing = custRows[custRows.length - 1].e.closingBalance;

        const rowsHtml = custRows
          .map(
            (r) => `
          <tr>
            <td>${esc(r.date)}</td>
            <td class="num">${esc(fmtNum(r.e.weight))}</td>
            <td class="num">${esc(fmtNum(r.e.rate))}</td>
            <td class="num">${esc(fmtMoney(r.e.amount))}</td>
            <td class="num">${esc(fmtMoney(r.e.previousBalance))}</td>
            <td class="num">${esc(fmtMoney(r.e.totalAmount))}</td>
            <td class="num">${esc(fmtMoney(r.e.recovery))}</td>
            <td class="num">${esc(fmtMoney(r.e.closingBalance))}</td>
          </tr>`
          )
          .join('');

        printWindow.document.write(`
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>${esc(custDisplayName)} — Statement</title>
              <style>
                @page { size: A4; margin: 12mm; }
                * { box-sizing: border-box; }
                body { font: 12px Arial, sans-serif; color: #111; }
                h1 { text-align: center; margin: 0 0 2px; font-size: 20px; }
                h2 { text-align: center; margin: 0 0 4px; font-size: 15px; }
                .meta { text-align: center; color: #555; margin-bottom: 14px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 5px 7px; }
                th { background: #f0f0f0; }
                .num { text-align: right; }
                tfoot td { font-weight: 700; background: #f7f7f7; }
                .closing { margin-top: 10px; text-align: right; font-size: 14px; font-weight: 700; }
                .print-bar { text-align: center; margin-top: 18px; }
                .print-bar button {
                  font: 14px Arial, sans-serif; padding: 8px 22px; border-radius: 6px;
                  border: 1px solid #333; background: #222; color: #fff; cursor: pointer;
                }
                @media print { .print-bar { display: none; } }
              </style>
            </head>
            <body>
              <h1>${esc(SHOP_NAME)}</h1>
              <div class="meta">${esc(SHOP_PHONE)}</div>
              <h2>${esc(custDisplayName)}${area ? ' — ' + esc(area) : ''}${phone ? ' — ' + esc(phone) : ''}</h2>
              <div class="meta">${esc(rangeFrom)} to ${esc(rangeTo)}</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th class="num">Weight</th>
                    <th class="num">Rate</th>
                    <th class="num">Amount</th>
                    <th class="num">Prev Balance</th>
                    <th class="num">Total Amount</th>
                    <th class="num">Recovery</th>
                    <th class="num">Closing Balance</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td class="num">${esc(fmtNum(grand.weight))}</td>
                    <td class="num"></td>
                    <td class="num">${esc(fmtMoney(grand.amount))}</td>
                    <td class="num"></td>
                    <td class="num"></td>
                    <td class="num">${esc(fmtMoney(grand.recovery))}</td>
                    <td class="num"></td>
                  </tr>
                </tfoot>
              </table>
              <div class="closing">Final Closing Balance: ${esc(fmtMoney(finalClosing))}</div>
              <div class="print-bar">
                <button onclick="window.print()">🖨 Print</button>
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        setRangeLoading(false);
        return;
      }

      // ---- Naam nahi diya gaya — poori range ka overall summary ----
      const rows = dates
        .map((d, i) => ({ date: d, res: results[i] }))
        .filter((r) => r.res && !r.res.data.isNew && r.res.data.data?.totals)
        .map((r) => ({ date: r.date, totals: r.res.data.data.totals }));

      if (!rows.length) {
        show('Is range mein koi saved data nahi mila', 'error');
        printWindow.close();
        return;
      }

      const grand = rows.reduce(
        (acc, r) => {
          const tt = r.totals;
          acc.weight += Number(tt.weight || 0);
          acc.amount += Number(tt.amount || 0);
          acc.recovery += Number(tt.recovery || 0);
          acc.purchaseAmount += Number(tt.purchaseAmount || 0);
          acc.expenseTotal += Number(tt.expenseTotal || 0);
          acc.grossProfit += Number(tt.grossProfit || 0);
          acc.netProfit += Number(tt.netProfit || 0);
          return acc;
        },
        { weight: 0, amount: 0, recovery: 0, purchaseAmount: 0, expenseTotal: 0, grossProfit: 0, netProfit: 0 }
      );

      const rowsHtml = rows
        .map(
          (r) => `
        <tr>
          <td>${esc(r.date)}</td>
          <td class="num">${esc(fmtNum(r.totals.weight))}</td>
          <td class="num">${esc(fmtMoney(r.totals.amount))}</td>
          <td class="num">${esc(fmtMoney(r.totals.recovery))}</td>
          <td class="num">${esc(fmtMoney(r.totals.purchaseAmount))}</td>
          <td class="num">${esc(fmtMoney(r.totals.expenseTotal))}</td>
          <td class="num">${esc(fmtMoney(r.totals.grossProfit))}</td>
          <td class="num">${esc(fmtMoney(r.totals.netProfit))}</td>
        </tr>`
        )
        .join('');

      printWindow.document.write(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>${esc(SHOP_NAME)} — Range Report</title>
            <style>
              @page { size: A4; margin: 12mm; }
              * { box-sizing: border-box; }
              body { font: 12px Arial, sans-serif; color: #111; }
              h1 { text-align: center; margin: 0 0 2px; font-size: 20px; }
              .meta { text-align: center; color: #555; margin-bottom: 14px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #999; padding: 5px 7px; }
              th { background: #f0f0f0; }
              .num { text-align: right; }
              tfoot td { font-weight: 700; background: #f7f7f7; }
              .print-bar { text-align: center; margin-top: 18px; }
              .print-bar button {
                font: 14px Arial, sans-serif; padding: 8px 22px; border-radius: 6px;
                border: 1px solid #333; background: #222; color: #fff; cursor: pointer;
              }
              @media print { .print-bar { display: none; } }
            </style>
          </head>
          <body>
            <h1>${esc(SHOP_NAME)}</h1>
            <div class="meta">${esc(SHOP_PHONE)} — ${esc(rangeFrom)} to ${esc(rangeTo)}</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th class="num">Weight</th>
                  <th class="num">Sale</th>
                  <th class="num">Recovery</th>
                  <th class="num">Purchase</th>
                  <th class="num">Expense</th>
                  <th class="num">Gross Profit</th>
                  <th class="num">Net Profit</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td class="num">${esc(fmtNum(grand.weight))}</td>
                  <td class="num">${esc(fmtMoney(grand.amount))}</td>
                  <td class="num">${esc(fmtMoney(grand.recovery))}</td>
                  <td class="num">${esc(fmtMoney(grand.purchaseAmount))}</td>
                  <td class="num">${esc(fmtMoney(grand.expenseTotal))}</td>
                  <td class="num">${esc(fmtMoney(grand.grossProfit))}</td>
                  <td class="num">${esc(fmtMoney(grand.netProfit))}</td>
                </tr>
              </tfoot>
            </table>
            <div class="print-bar">
              <button onclick="window.print()">🖨 Print</button>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
    } finally {
      setRangeLoading(false);
    }
  };

  const shiftDay = (n) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    const nd = d.toISOString().slice(0, 10);
    setDate(nd);
    navigate(`/daily/${nd}`, { replace: true });
  };

  if (loading || !sheet) return <div className="loading">{t('common.loading')}</div>;

  const rows = sheet.entries.filter((e) => {
    if (filter && !e.customerName?.includes(filter)) return false;
    if (onlyActive && !(parsePlus(e.loadsText).length || e.weight || parsePlus(e.recoveryText).length)) return false;
    return true;
  });

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{SHOP_NAME}</h1>
          <div className="sub">
            <strong>{SHOP_PHONE}</strong>
            {' — '}
            {isNew ? t('daily.newSheet') : t('daily.savedSheet')}
            {sheet.isLocked && <span className="chip warn" style={{ marginInlineStart: '.5rem' }}>{t('daily.locked')}</span>}
          </div>
        </div>

        <div className="split">
          <button className="btn ghost sm" onClick={() => shiftDay(-1)}>{t('daily.prevDay')}</button>
          <input
            type="date"
            style={{ width: 160 }}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              navigate(`/daily/${e.target.value}`, { replace: true });
            }}
          />
          <button className="btn ghost sm" onClick={() => shiftDay(1)}>{t('daily.nextDay')}</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '.75rem' }}>
        <div className="card-title">
          <span>Range Report (Print)</span>
        </div>
        <div className="split" style={{ gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 170, marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 170, marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <label>Customer Name (optional)</label>
            <input
              type="text"
              list="range-customer-names"
              placeholder="Sab customers (khali chhoro)"
              value={rangeCustomer}
              onChange={(e) => setRangeCustomer(e.target.value)}
            />
            <datalist id="range-customer-names">
              {customerOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <button className="btn gold sm" onClick={printRangeReport} disabled={rangeLoading}>
            {rangeLoading ? t('common.loading') : rangeCustomer.trim() ? 'Print Customer Statement' : 'Print Range'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">
          <span>{t('daily.customersHeading')} ({rows.length})</span>
          <div className="split">
            <input
              placeholder={t('daily.searchName')}
              style={{ width: 170 }}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="split" style={{ marginBottom: 0, gap: '.3rem' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />
              {t('daily.onlyToday')}
            </label>
            {editable && (
              <button className="btn ghost sm" onClick={applyRateToAll}>
                {t('daily.applyRateAll')}
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th className="sticky-name">{t('daily.col.name')}</th>
                <th className="num">{t('daily.col.weight')}</th>
                <th className="num">{t('daily.col.rate')}</th>
                <th className="num">{t('daily.col.amount')}</th>
                <th className="num">{t('daily.col.prevBalance')}</th>
                <th className="num">{t('daily.col.totalAmount')}</th>
                <th className="num">{t('daily.col.recovery')}</th>
                <th className="num">{t('daily.col.newBalance')}</th>
                <th>{t('common.print')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const i = sheet.entries.indexOf(e);
                const inactive = !e.weight && !e.recovery;
                return (
                  <tr key={e.customerId} className={inactive ? 'dim' : ''}>
                    <td className="muted num">{i + 1}</td>
                    <td className="sticky-name">
                      {e.customerName}
                      {e.area && <span className="muted"> — {e.area}</span>}
                      {e.phone && <div className="muted" style={{ fontSize: '.78rem', lineHeight: 1.2 }}>{e.phone}</div>}
                    </td>
                    <td className="num">
                      <input
                        className="cell num"
                        style={{ width: 110 }}
                        disabled={!editable}
                        title={t('daily.loadHint')}
                        value={e.loadsText}
                        onChange={(ev) => setEntry(i, { loadsText: ev.target.value })}
                        onFocus={(ev) => ev.target.select()}
                      />
                    </td>
                    <td className="num">
                      <Cell value={e.rate} disabled={!editable} width={70} onChange={(v) => setEntry(i, { rate: v })} />
                    </td>
                    <td className="num">{fmtMoney(e.amount)}</td>
                    <td className="num muted">{fmtMoney(e.previousBalance)}</td>
                    <td className="num">{fmtMoney(e.totalAmount)}</td>
                    <td className="num">
                      <input
                        className="cell num"
                        style={{ width: 150 }}
                        disabled={!editable}
                        title={t('daily.recoveryHint')}
                        value={e.recoveryText}
                        onChange={(ev) => setEntry(i, { recoveryText: ev.target.value })}
                        onFocus={(ev) => ev.target.select()}
                      />
                    </td>
                    <td className={`num ${e.closingBalance > 0 ? 'debit' : 'credit'}`}>
                      {fmtMoney(e.closingBalance)}
                    </td>
                    <td>
                      <button className="btn ghost sm" onClick={() => printBill(e)}>
                        {t('common.print')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  <td colSpan={2}>{t('common.total')}</td>
                  <td className="num">{fmtNum(totals.weight)}</td>
                  <td className="num">{fmtNum(totals.avgRate)}</td>
                  <td className="num">{fmtMoney(totals.amount)}</td>
                  <td className="num">{fmtMoney(totals.previousBalance)}</td>
                  <td className="num">{fmtMoney(totals.totalAmount)}</td>
                  <td className="num">{fmtMoney(totals.recovery)}</td>
                  <td className="num">{fmtMoney(totals.closingBalance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
        <div className="card">
          <div className="card-title">
            <span>{t('daily.purchases')}</span>
            {editable && (
              <button className="btn ghost sm" onClick={addPurchaseRow}>
                {t('daily.addLine')}
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('daily.supplier')}</th>
                  <th>{t('daily.vehicle')}</th>
                  <th className="num">{t('daily.col.weight')}</th>
                  <th className="num">{t('daily.col.rate')}</th>
                  <th className="num">{t('daily.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.purchases.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        disabled={!editable}
                        value={p.supplierId || ''}
                        onChange={(e) => {
                          const s = suppliers.find((x) => x._id === e.target.value);
                          setPurchase(i, {
                            supplierId: e.target.value,
                            supplierName: s?.name,
                            vehicleNo: p.vehicleNo || s?.vehicleNo || '',
                          });
                        }}
                      >
                        <option value="">{t('daily.choose')}</option>
                        {suppliers.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="cell"
                        style={{ width: 60, textAlign: 'right' }}
                        disabled={!editable}
                        value={p.vehicleNo || ''}
                        onChange={(e) => setPurchase(i, { vehicleNo: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <Cell value={p.weight} disabled={!editable} onChange={(v) => setPurchase(i, { weight: v })} />
                    </td>
                    <td className="num">
                      <Cell value={p.rate} width={70} disabled={!editable} onChange={(v) => setPurchase(i, { rate: v })} />
                    </td>
                    <td className="num">{fmtMoney(Number(p.weight || 0) * Number(p.rate || 0))}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t('daily.totalPurchase')}</td>
                    <td className="num">{fmtNum(totals.purchaseWeight)}</td>
                    <td className="num">{fmtNum(totals.purchaseAvgRate)}</td>
                    <td className="num">{fmtMoney(totals.purchaseAmount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>
                      {totals.excessShort < 0 ? t('daily.short') : totals.excessShort > 0 ? t('daily.excess') : t('daily.equal')}
                    </td>
                    <td className={`num ${totals.excessShort < 0 ? 'debit' : 'credit'}`}>
                      {fmtNum(totals.excessShort)}
                    </td>
                    <td colSpan={2} className="muted">
                      {t('daily.shortNote')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>{t('daily.expenses')}</span>
            {editable && (
              <button className="btn ghost sm" onClick={addExpenseRow}>
                {t('daily.addExpense')}
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('daily.head')}</th>
                  <th className="num">{t('daily.col.amount')}</th>
                  <th>{t('daily.description')}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.expenses.map((x, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        disabled={!editable}
                        value={x.head || ''}
                        onChange={(e) => {
                          const h = heads.find((y) => y._id === e.target.value);
                          setExpense(i, { head: e.target.value, headName: h?.name || t('daily.misc') });
                        }}
                      >
                        <option value="">{t('daily.misc')}</option>
                        {heads.map((h) => (
                          <option key={h._id} value={h._id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <Cell value={x.amount} disabled={!editable} onChange={(v) => setExpense(i, { amount: v })} />
                    </td>
                    <td>
                      <input
                        className="cell"
                        style={{ width: '100%', textAlign: 'right' }}
                        disabled={!editable}
                        value={x.note || ''}
                        onChange={(e) => setExpense(i, { note: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr>
                    <td>{t('daily.totalExpense')}</td>
                    <td className="num">{fmtMoney(totals.expenseTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {costing && (
            <div style={{ marginTop: '1rem' }}>
              <div className="card-title">{t('daily.costing')}</div>
              <div className="field-row">
                <div className="field" style={{ maxWidth: 130 }}>
                  <label>{t('daily.baseRate')}</label>
                  <input
                    className="num"
                    type="number"
                    disabled={!editable}
                    value={sheet.costing?.baseRate || ''}
                    onChange={(e) =>
                      setSheet((s) => ({ ...s, costing: { ...s.costing, baseRate: Number(e.target.value || 0) } }))
                    }
                  />
                </div>
                <div className="field" style={{ maxWidth: 130 }}>
                  <label>{t('daily.shortWeight')}</label>
                  <input
                    className="num"
                    type="number"
                    placeholder={String(Math.abs(totals?.excessShort || 0))}
                    disabled={!editable}
                    value={sheet.costing?.shortWeight ?? ''}
                    onChange={(e) =>
                      setSheet((s) => ({
                        ...s,
                        costing: { ...s.costing, shortWeight: e.target.value === '' ? null : Number(e.target.value) },
                      }))
                    }
                  />
                </div>
                <div className="field" style={{ maxWidth: 150 }}>
                  <label>{t('daily.shortValue')}</label>
                  <input
                    className="num"
                    type="number"
                    title={t('daily.shortValueHint')}
                    placeholder={fmtMoney(costing.shortValue)}
                    disabled={!editable}
                    value={sheet.costing?.manualShortValue ?? ''}
                    onChange={(e) =>
                      setSheet((s) => ({
                        ...s,
                        costing: {
                          ...s.costing,
                          manualShortValue: e.target.value === '' ? null : Number(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="field" style={{ maxWidth: 150 }}>
                  <label>{t('daily.totalCosting')}</label>
                  <input
                    className="num"
                    readOnly
                    title={t('daily.totalCostingHint')}
                    value={fmtMoney(costing.totalCosting)}
                  />
                </div>
                <div className="field" style={{ maxWidth: 130 }}>
                  <label>{t('daily.perKg')}</label>
                  <input className="num" readOnly value={fmtNum(costing.perKg, 2)} />
                </div>
                <div className="field" style={{ maxWidth: 140 }}>
                  <label>{t('daily.costingRate')}</label>
                  <input className="num" readOnly value={fmtNum(costing.costingRate, 2)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {totals && (
        <div className="rail">
          <div className="rail-item">
            <span>{t('daily.railWeight')}</span>
            <b>{fmtNum(totals.weight)}</b>
          </div>
          <div className="rail-item">
            <span>{t('daily.railAvgRate')}</span>
            <b>{fmtNum(totals.avgRate, 2)}</b>
          </div>
          <div className="rail-item">
            <span>{t('daily.railSale')}</span>
            <b>{fmtMoney(totals.amount)}</b>
          </div>
          <div className="rail-item">
            <span>{t('daily.railRecovery')}</span>
            <b>{fmtMoney(totals.recovery)}</b>
          </div>
          <div className="rail-item">
            <span>{t('daily.railGross')}</span>
            <b>{fmtMoney(totals.grossProfit)}</b>
          </div>
          <div className="rail-item hero">
            <span>{t('daily.railNet')}</span>
            <b>{fmtMoney(totals.netProfit)}</b>
          </div>

          <div className="spacer" />

          {can('admin', 'manager') && !isNew && (
            <>
              <button className="btn ghost sm" style={{ color: '#c3d0dc', borderColor: '#46596c' }} onClick={postLedgers}>
                {t('daily.postLedgers')}
              </button>
              <button className="btn ghost sm" style={{ color: '#c3d0dc', borderColor: '#46596c' }} onClick={toggleLock}>
                {sheet.isLocked ? t('daily.unlock') : t('daily.lock')}
              </button>
            </>
          )}
          {editable && (
            <button className="btn gold" onClick={save} disabled={saving}>
              {saving ? t('common.saving') : t('daily.saveSheet')}
            </button>
          )}
        </div>
      )}
    </>
  );
}