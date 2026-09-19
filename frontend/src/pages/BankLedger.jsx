import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMsg, fmtMoney, today } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { date: today(), reference: '', deposit: 0, withdraw: 0 };

export default function BankLedger() {
  const { t } = useLang();
  const { id } = useParams();
  const { can } = useAuth();
  const { toast, show, clear } = useToast();
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
    api
      .get(`/ledger/bank/${id}${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setData(data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    if (!form.deposit && !form.withdraw) return show(t('bankLedger.depositOrWithdrawError'), 'error');
    try {
      if (editingId) {
        await api.put(`/ledger/bank/${id}/${editingId}`, form);
        show(t('common.save'));
      } else {
        await api.post(`/ledger/bank/${id}`, form);
        show(t('bankLedger.entrySubmit'));
      }
      setForm({ ...BLANK, date: form.date });
      setEditingId(null);
      load();
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  const startEdit = (row) => {
    setEditingId(row._id);
    setForm({
      date: new Date(row.date).toISOString().slice(0, 10),
      reference: row.reference || '',
      deposit: row.deposit || 0,
      withdraw: row.withdraw || 0,
    });
    document.getElementById('bank-entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...BLANK });
  };

  const del = async (txnId) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/ledger/bank/${id}/${txnId}`);
      show(t('common.delete'));
      load();
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  if (loading) return <div className="loading">{t('common.loading')}</div>;
  if (!data) return <Empty>{t('common.noData')}</Empty>;

  const s = data.summary;

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{data.account.title}</h1>
          <div className="sub num" style={{ direction: 'ltr', textAlign: 'right' }}>
            {data.account.bankName} — {data.account.accountNo}
          </div>
          <div className="sub">
            {data.account.branch} · <Link to="/banks">{t('bankLedger.allAccounts')}</Link>
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
        </div>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">{t('bankLedger.opening')}</div>
          <div className="stat-value">{fmtMoney(s.openingBalance)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('bankLedger.totalDeposit')}</div>
          <div className="stat-value credit">{fmtMoney(s.totalDeposit)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('bankLedger.totalWithdraw')}</div>
          <div className="stat-value debit">{fmtMoney(s.totalWithdraw)}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">{t('bankLedger.currentBalance')}</div>
          <div className="stat-value">{fmtMoney(s.closingBalance)}</div>
        </div>
      </div>

      {can('admin', 'manager', 'operator') && (
        <form id="bank-entry-form" className="card" onSubmit={add} style={{ marginTop: '1rem' }}>
          <div className="card-title">{editingId ? t('common.edit') : t('bankLedger.newEntry')}</div>
          <div className="field-row">
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('common.date')}</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>{t('bankLedger.reference')}</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('bankLedger.deposit')}</label>
              <input
                className="num"
                type="number"
                value={form.deposit || ''}
                onChange={(e) => setForm({ ...form, deposit: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('bankLedger.withdraw')}</label>
              <input
                className="num"
                type="number"
                value={form.withdraw || ''}
                onChange={(e) => setForm({ ...form, withdraw: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <div className="split">
                <button className="btn gold">{editingId ? t('common.save') : t('bankLedger.entrySubmit')}</button>
                {editingId && (
                  <button type="button" className="btn ghost" onClick={cancelEdit}>
                    {t('common.cancel')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-title">{t('bankLedger.statement')}</div>
        {data.rows.length === 0 ? (
          <Empty>{t('bankLedger.empty')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>{t('common.date')}</th>
                  <th>{t('bankLedger.reference')}</th>
                  <th className="num">{t('bankLedger.deposit')}</th>
                  <th className="num">{t('bankLedger.withdraw')}</th>
                  <th className="num">{t('dashboard.balance')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r._id}>
                    <td className="muted num">{i + 1}</td>
                    <td className="num">{new Date(r.date).toISOString().slice(0, 10)}</td>
                    <td style={{ minWidth: 280 }}>{r.reference || '—'}</td>
                    <td className="num credit">{r.deposit ? fmtMoney(r.deposit) : '—'}</td>
                    <td className="num debit">{r.withdraw ? fmtMoney(r.withdraw) : '—'}</td>
                    <td className="num">{fmtMoney(r.balance)}</td>
                    <td>
                      <div className="split" style={{ gap: '.3rem' }}>
                        {can('admin', 'manager') && (
                          <button className="btn ghost sm" onClick={() => startEdit(r)}>
                            {t('common.edit')}
                          </button>
                        )}
                        {can('admin') && (
                          <button className="btn ghost sm" onClick={() => del(r._id)}>
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t('common.total')}</td>
                  <td className="num">{fmtMoney(s.totalDeposit)}</td>
                  <td className="num">{fmtMoney(s.totalWithdraw)}</td>
                  <td className="num">{fmtMoney(s.closingBalance)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
