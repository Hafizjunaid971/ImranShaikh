import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMsg, fmtMoney, fmtNum } from '../api/client';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

export default function CustomerLedger() {
  const { t } = useLang();
  const { id } = useParams();
  const { toast, show, clear } = useToast();
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
          <button className="btn ghost" onClick={() => window.print()}>
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
          <div className="table-wrap">
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
