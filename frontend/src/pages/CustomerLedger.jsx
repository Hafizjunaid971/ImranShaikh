import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMsg, fmtMoney, fmtNum } from '../api/client';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const formatDateLabel = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
};

export default function CustomerLedger() {
  const { t } = useLang();
  const { id } = useParams();
  const { toast, show, clear } = useToast();
  const tableWrapRef = useRef(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
    api
      .get(`/ledger/customer/${id}${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setData(data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading">{t('customerLedger.ledger')}…</div>;
  if (!data) return <Empty>{t('common.noData')}</Empty>;

  const s = data.summary;

  const printRange = () => {
    const from = range.from || data.rows[0]?.date || '';
    const to = range.to || data.rows[data.rows.length - 1]?.date || '';
    const tableEl = tableWrapRef.current?.querySelector('table');
    const scrollTop = tableWrapRef.current?.scrollTop || 0;
    const scrollLeft = tableWrapRef.current?.scrollLeft || 0;
    const printWindow = window.open('', '_blank', 'width=1100,height=900');

    if (!printWindow) {
      show(t('common.allowPopup') || 'Please allow pop-ups to print.', 'error');
      return;
    }

    const rowsHtml = tableEl ? Array.from(tableEl.querySelectorAll('tbody > tr')).map((tr) => tr.outerHTML).join('') : '';
    // const summaryHtml = `
    //   <div class="summary-grid">
    //     <div><span>${t('customerLedger.opening')}</span><strong>${fmtMoney(s.openingBalance)}</strong></div>
    //     <div><span>${t('customerLedger.totalPurchase')}</span><strong>${fmtNum(s.totalWeight, 1)}</strong><small>${fmtMoney(s.totalAmount)} — ${t('dashboard.avgRate')} ${fmtNum(s.avgRate, 2)}</small></div>
    //     <div><span>${t('customerLedger.totalRecovery')}</span><strong>${fmtMoney(s.totalRecovery)}</strong></div>
    //     <div><span>${t('customerLedger.currentBalance')}</span><strong>${fmtMoney(s.closingBalance)}</strong></div>
    //   </div>
    // `;

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${data.customer.name} Ledger</title>
          <style>
            body { font-family: Arial, sans-serif; color: #1b2a3a; margin: 24px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
            .title { font-size: 24px; font-weight: 700; }
            .meta { font-size: 12px; color: #46596c; }
            .range { margin-top: 8px; font-size: 12px; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; margin: 18px 0; }
            .summary-grid > div { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; background: #f8f8f8; }
            .summary-grid span { display: block; font-size: 11px; color: #46596c; margin-bottom: 4px; }
            .summary-grid strong { display: block; font-size: 18px; }
            .summary-grid small { display: block; font-size: 11px; color: #46596c; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d9d9d9; padding: 6px 8px; text-align: left; }
            th { background: #1b2a3a; color: #fff; }
            .num { text-align: right; }
            .credit { color: #1d6b4b; }
            .debit { color: #a63a2b; }
            .muted { color: #8a99a8; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${data.customer.name}</div>
              <div class="meta">${data.customer.area || t('customerLedger.ledger')} ${data.customer.phone ? `— ${data.customer.phone}` : ''}</div>
              <div class="range">${from && to ? `${formatDateLabel(from)} - ${formatDateLabel(to)}` : t('customerLedger.ledger')}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>${t('common.date')}</th>
                <th class="num">${t('daily.col.weight')}</th>
                <th class="num">${t('daily.col.rate')}</th>
                <th class="num">${t('daily.col.amount')}</th>
                <th class="num">${t('daily.col.prevBalance')}</th>
                <th class="num">${t('daily.col.totalAmount')}</th>
                <th class="num">${t('party.recovery')}</th>
                <th class="num">${t('daily.col.newBalance')}</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr>
                <td>${t('common.total')}</td>
                <td class="num">${fmtNum(s.totalWeight, 1)}</td>
                <td class="num">${fmtNum(s.avgRate, 2)}</td>
                <td class="num">${fmtMoney(s.totalAmount)}</td>
                <td class="num"></td>
                <td class="num"></td>
                <td class="num">${fmtMoney(s.totalRecovery)}</td>
                <td class="num">${fmtMoney(s.closingBalance)}</td>
              </tr>
            </tfoot>
          </table>
          <script>
            window.onload = function () { window.print(); setTimeout(() => window.close(), 300); };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
    if (tableWrapRef.current) {
      tableWrapRef.current.scrollTop = scrollTop;
      tableWrapRef.current.scrollLeft = scrollLeft;
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{data.customer.name}</h1>
          <div className="sub">
            {data.customer.area || t('customerLedger.ledger')} {data.customer.phone ? `— ${data.customer.phone}` : ''} ·{' '}
            <Link to="/customers">{t('customerLedger.allCustomers')}</Link>
          </div>
        </div>
        <div className="split">
          <div>
            <label>{t('common.from')}</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div>
            <label>{t('common.to')}</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <button className="btn" onClick={load}>
            {t('common.show')}
          </button>
          <button className="btn ghost" onClick={printRange}>
            {t('common.print')}
          </button>
        </div>
      </div>

      <div className="grid grid-4 customer-ledger-summary">
        <div className="stat">
          <div className="stat-label">{t('customerLedger.opening')}</div>
          <div className="stat-value">{fmtMoney(s.openingBalance)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('customerLedger.totalPurchase')}</div>
          <div className="stat-value">{fmtNum(s.totalWeight, 1)}</div>
          <div className="stat-note">{fmtMoney(s.totalAmount)} — {t('dashboard.avgRate')} {fmtNum(s.avgRate, 2)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('customerLedger.totalRecovery')}</div>
          <div className="stat-value credit">{fmtMoney(s.totalRecovery)}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">{t('customerLedger.currentBalance')}</div>
          <div className="stat-value">{fmtMoney(s.closingBalance)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('customerLedger.detail')}</div>
        {data.rows.length === 0 ? (
          <Empty>{t('customerLedger.noBusiness')}</Empty>
        ) : (
          <div className="table-wrap" ref={tableWrapRef}>
            <table>
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th className="num">{t('daily.col.weight')}</th>
                  <th className="num">{t('daily.col.rate')}</th>
                  <th className="num">{t('daily.col.amount')}</th>
                  <th className="num">{t('daily.col.prevBalance')}</th>
                  <th className="num">{t('daily.col.totalAmount')}</th>
                  <th className="num">{t('party.recovery')}</th>
                  <th className="num">{t('daily.col.newBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{new Date(r.date).toISOString().slice(0, 10)}</td>
                    <td className="num">{fmtNum(r.weight, 1)}</td>
                    <td className="num">{fmtNum(r.rate, 0)}</td>
                    <td className="num">{fmtMoney(r.amount)}</td>
                    <td className="num muted">{fmtMoney(r.previousBalance)}</td>
                    <td className="num">{fmtMoney(r.totalAmount)}</td>
                    <td className="num credit">{fmtMoney(r.recovery)}</td>
                    <td className="num debit">{fmtMoney(r.closingBalance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('common.total')}</td>
                  <td className="num">{fmtNum(s.totalWeight, 1)}</td>
                  <td className="num">{fmtNum(s.avgRate, 2)}</td>
                  <td className="num">{fmtMoney(s.totalAmount)}</td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num">{fmtMoney(s.totalRecovery)}</td>
                  <td className="num">{fmtMoney(s.closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
