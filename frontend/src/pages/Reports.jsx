import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, fmtMoney, fmtNum, today } from '../api/client';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function Reports() {
  const { t } = useLang();
  const TABS = [
    { key: 'profit', label: t('reports.tabs.profit') },
    { key: 'recovery', label: t('reports.tabs.recovery') },
    { key: 'expenses', label: t('reports.tabs.expenses') },
  ];
  const { toast, show, clear } = useToast();
  const [tab, setTab] = useState('profit');
  const [range, setRange] = useState({ from: firstOfMonth(), to: today() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams(range).toString();
    api
      .get(`/reports/${tab}?${qs}`)
      .then(({ data }) => setData(data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /** بیک اینڈ سے asli formulas والی .xlsx فائل منگوا کر ڈاؤن لوڈ کرواتا ہے */
  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get('/export/excel', {
        params: { from: range.from, to: range.to },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger_${range.from}_to_${range.to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      show(errMsg(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('reports.title')}</h1>
          <div className="sub">{t('reports.rangeSummary', range.from, range.to)}</div>
        </div>
        <div className="split">
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <button className="btn" onClick={load}>
            {t('common.show')}
          </button>
          <button className="btn ghost" onClick={() => window.print()}>
            {t('common.print')}
          </button>
          <button className="btn gold" onClick={exportExcel} disabled={exporting}>
            {exporting ? '…' : t('reports.exportExcel')}
          </button>
        </div>
      </div>

      <div className="split" style={{ marginBottom: '1rem' }}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            className={`btn ${tab === tb.key ? 'gold' : 'ghost'}`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : !data ? (
        <Empty>{t('common.noData')}</Empty>
      ) : tab === 'profit' ? (
        <ProfitTable data={data} t={t} />
      ) : tab === 'recovery' ? (
        <RecoveryTable data={data} t={t} />
      ) : (
        <ExpenseTable data={data} t={t} />
      )}
    </>
  );
}

function ProfitTable({ data, t }) {
  const tt = data.totals;
  const c = t('reports.profit.col');
  if (!data.rows.length) return <Empty>{t('reports.profit.noSheets')}</Empty>;
  return (
    <>
      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">{t('reports.profit.totalWeight')}</div>
          <div className="stat-value">{fmtNum(tt.saleWeight, 1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('reports.profit.totalSale')}</div>
          <div className="stat-value">{fmtMoney(tt.saleAmount)}</div>
          <div className="stat-note">{t('reports.profit.avgRate')} {fmtNum(tt.avgSaleRate, 2)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('reports.profit.expenses')}</div>
          <div className="stat-value debit">{fmtMoney(tt.expense)}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">{t('reports.profit.netProfit')}</div>
          <div className="stat-value">{fmtMoney(tt.netProfit)}</div>
          <div className="stat-note">{t('reports.profit.perKg')} {fmtNum(tt.profitPerKg, 2)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{c.date}</th>
                <th className="num">{c.saleWeight}</th>
                <th className="num">{c.avgRate}</th>
                <th className="num">{c.saleAmount}</th>
                <th className="num">{c.purchaseWeight}</th>
                <th className="num">{c.purchaseAmount}</th>
                <th className="num">{c.excessShort}</th>
                <th className="num">{c.gross}</th>
                <th className="num">{c.expense}</th>
                <th className="num">{c.net}</th>
                <th className="num">{c.costingRate}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.date}>
                  <td className="num">
                    <Link to={`/daily/${new Date(r.date).toISOString().slice(0, 10)}`}>
                      {new Date(r.date).toISOString().slice(0, 10)}
                    </Link>
                  </td>
                  <td className="num">{fmtNum(r.saleWeight, 1)}</td>
                  <td className="num">{fmtNum(r.avgRate, 2)}</td>
                  <td className="num">{fmtMoney(r.saleAmount)}</td>
                  <td className="num">{fmtNum(r.purchaseWeight, 1)}</td>
                  <td className="num">{fmtMoney(r.purchaseAmount)}</td>
                  <td className={`num ${r.excessShort < 0 ? 'debit' : 'credit'}`}>{fmtNum(r.excessShort, 1)}</td>
                  <td className="num">{fmtMoney(r.grossProfit)}</td>
                  <td className="num debit">{fmtMoney(r.expense)}</td>
                  <td className={`num ${r.netProfit < 0 ? 'debit' : 'credit'}`}>{fmtMoney(r.netProfit)}</td>
                  <td className="num">{fmtNum(r.costingRate, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('common.total')}</td>
                <td className="num">{fmtNum(tt.saleWeight, 1)}</td>
                <td className="num">{fmtNum(tt.avgSaleRate, 2)}</td>
                <td className="num">{fmtMoney(tt.saleAmount)}</td>
                <td className="num">{fmtNum(tt.purchaseWeight, 1)}</td>
                <td className="num">{fmtMoney(tt.purchaseAmount)}</td>
                <td className="num">{fmtNum(tt.excessShort, 1)}</td>
                <td className="num">{fmtMoney(tt.grossProfit)}</td>
                <td className="num">{fmtMoney(tt.expense)}</td>
                <td className="num">{fmtMoney(tt.netProfit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

function RecoveryTable({ data, t }) {
  const tt = data.totals;
  const c = t('reports.recovery.col');
  if (!data.rows.length) return <Empty>{t('reports.recovery.none')}</Empty>;
  return (
    <div className="card">
      <div className="card-title">
        <span>{t('reports.recovery.byCustomer')}</span>
        <span className="muted">
          {t('reports.recovery.totalBalance')}: <span className="num debit">{fmtMoney(tt.balance)}</span>
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{c.name}</th>
              <th className="num">{c.days}</th>
              <th className="num">{c.weight}</th>
              <th className="num">{c.sale}</th>
              <th className="num">{c.recovery}</th>
              <th className="num">{c.balance}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={r.customer}>
                <td className="muted num">{i + 1}</td>
                <td>
                  <Link to={`/customers/${r.customer}`}>{r.name}</Link>
                </td>
                <td className="num">{r.days}</td>
                <td className="num">{fmtNum(r.totalWeight, 1)}</td>
                <td className="num">{fmtMoney(r.totalSale)}</td>
                <td className="num credit">{fmtMoney(r.totalRecovery)}</td>
                <td className={`num ${r.lastBalance > 0 ? 'debit' : 'credit'}`}>{fmtMoney(r.lastBalance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('common.total')}</td>
              <td className="num">{fmtNum(tt.weight, 1)}</td>
              <td className="num">{fmtMoney(tt.sale)}</td>
              <td className="num">{fmtMoney(tt.recovery)}</td>
              <td className="num">{fmtMoney(tt.balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ExpenseTable({ data, t }) {
  const c = t('reports.expenses.col');
  if (!data.rows.length) return <Empty>{t('reports.expenses.none')}</Empty>;
  return (
    <div className="card">
      <div className="card-title">
        <span>{t('reports.expenses.heading')}</span>
        <span className="muted num">{fmtMoney(data.total)}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{c.head}</th>
              <th className="num">{c.entries}</th>
              <th className="num">{c.total}</th>
              <th className="num">{c.share}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.head}>
                <td>{r.head}</td>
                <td className="num">{r.count}</td>
                <td className="num">{fmtMoney(r.total)}</td>
                <td className="num">{fmtNum(r.share, 1)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{t('common.total')}</td>
              <td className="num">{fmtMoney(data.total)}</td>
              <td className="num">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
