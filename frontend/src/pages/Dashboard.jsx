import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import api, { errMsg, fmtMoney, fmtNum, monthKey } from '../api/client';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

export default function Dashboard() {
  const { t, lang } = useLang();
  const { toast, show, clear } = useToast();
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/reports/dashboard?month=${month}`)
      .then(({ data }) => setData(data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  }, [month, show]);

  if (loading) return <div className="loading">{t('common.loading')}</div>;
  if (!data) return <Empty>{t('common.noData')}</Empty>;

  const s = data.summary;
  const kWeight = t('daily.railWeight');
  const kNet = t('daily.railNet');
  const kAvgRate = t('dashboard.avgRate');
  const kCosting = t('daily.costingRate');
  const chart = data.trend.map((row) => ({
    din: new Date(row.date).getDate(),
    [kWeight]: row.weight,
    [kNet]: row.netProfit,
    [kAvgRate]: row.avgRate,
    [kCosting]: row.costingRate,
  }));

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <div className="sub">
            {t('dashboard.daysSummary', s.days)} — {t('dashboard.lastEntry')}{' '}
            {data.lastSheetDate ? new Date(data.lastSheetDate).toISOString().slice(0, 10) : '—'}
          </div>
        </div>
        <div className="split">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
          <Link className="btn" to="/daily">
            {t('dashboard.openTodaySheet')}
          </Link>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">{t('dashboard.totalWeight')}</div>
          <div className="stat-value">{fmtNum(s.saleWeight, 1)}</div>
          <div className="stat-note">{t('dashboard.avgRate')} {fmtNum(s.avgSaleRate, 2)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('dashboard.totalSale')}</div>
          <div className="stat-value">{fmtMoney(s.saleAmount)}</div>
          <div className="stat-note">{t('dashboard.purchase')} {fmtMoney(s.purchaseAmount)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('dashboard.recovery')}</div>
          <div className="stat-value credit">{fmtMoney(s.recovery)}</div>
          <div className="stat-note">{t('dashboard.recoveryNote')}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">{t('dashboard.netProfit')}</div>
          <div className="stat-value">{fmtMoney(s.netProfit)}</div>
          <div className="stat-note">
            {t('dashboard.perKg')} {fmtNum(s.netProfitPerKg, 2)} — {t('dashboard.expense')} {fmtMoney(s.expense)}
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginTop: '1rem' }}>
        <div className="stat">
          <div className="stat-label">{t('dashboard.customerOutstanding')}</div>
          <div className="stat-value debit">{fmtMoney(s.customerOutstanding)}</div>
          <div className="stat-note">
            <Link to="/customers">{t('dashboard.viewDetail')}</Link>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('dashboard.excessShort')}</div>
          <div className={`stat-value ${s.excessShort < 0 ? 'debit' : 'credit'}`}>{fmtNum(s.excessShort, 1)}</div>
          <div className="stat-note">{t('dashboard.monthTotal')}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('dashboard.grossProfit')}</div>
          <div className="stat-value">{fmtMoney(s.grossProfit)}</div>
          <div className="stat-note">{t('dashboard.avgPurchaseRate')} {fmtNum(s.avgPurchaseRate, 2)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('dashboard.bankBalance')}</div>
          <div className="stat-value">{fmtMoney(data.banks.reduce((t2, b) => t2 + b.balance, 0))}</div>
          <div className="stat-note">{data.banks.length} {t('dashboard.accountsCount')}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('dashboard.dailyPerformance')}</div>
        {chart.length === 0 ? (
          <Empty>{t('dashboard.noSheetsMonth')}</Empty>
        ) : (
          <div style={{ height: 320, direction: 'ltr' }}>
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#ddd8cb" vertical={false} />
                <XAxis dataKey="din" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtNum(v, 1)} />
                <Legend
                  wrapperStyle={{
                    fontFamily: lang === 'ur' ? 'Noto Naskh Arabic' : 'IBM Plex Sans',
                    fontSize: 13,
                  }}
                />
                <Bar yAxisId="l" dataKey={kWeight} fill="#1b2a3a" barSize={14} />
                <Line yAxisId="r" dataKey={kNet} stroke="#c9962b" strokeWidth={2} dot={false} />
                <Line yAxisId="r" dataKey={kAvgRate} stroke="#1d6b4b" strokeWidth={1.5} dot={false} />
                <Line yAxisId="r" dataKey={kCosting} stroke="#a63a2b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">{t('dashboard.bankAccountsHeading')}</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('banks.accountTitle')}</th>
                <th>{t('dashboard.bank')}</th>
                <th className="num">{t('dashboard.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.banks.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/banks/${b.id}`}>{b.title}</Link>
                  </td>
                  <td>{b.bankName}</td>
                  <td className={`num ${b.balance < 0 ? 'debit' : ''}`}>{fmtMoney(b.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
