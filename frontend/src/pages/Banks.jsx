import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, fmtMoney } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { title: '', accountNo: '', bankName: '', branch: '', openingBalance: 0 };

export default function Banks() {
  const { t } = useLang();
  const { can } = useAuth();
  const { toast, show, clear } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get('/reports/dashboard')
      .then(({ data }) => setRows(data.banks))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/bank-accounts', form);
      show(t('common.save'));
      setForm(null);
      load();
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('banks.title')}</h1>
          <div className="sub">
            {t('banks.totalBalance')} <span className="num">{fmtMoney(rows.reduce((t2, b) => t2 + b.balance, 0))}</span>
          </div>
        </div>
        {can('admin', 'manager') && (
          <button className="btn" onClick={() => setForm({ ...BLANK })}>
            {t('banks.newAccount')}
          </button>
        )}
      </div>

      {form && (
        <form className="card" onSubmit={save} style={{ marginBottom: '1rem' }}>
          <div className="card-title">{t('banks.newAccount')}</div>
          <div className="field-row">
            <div className="field">
              <label>{t('banks.accountTitle')}</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('banks.accountNo')}</label>
              <input
                className="num"
                required
                value={form.accountNo}
                onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('banks.bankName')}</label>
              <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('banks.branch')}</label>
              <input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('banks.openingBalance')}</label>
              <input
                className="num"
                type="number"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <div className="split">
                <button className="btn gold">{t('common.save')}</button>
                <button type="button" className="btn ghost" onClick={() => setForm(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <Empty>{t('banks.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('banks.accountTitle')}</th>
                  <th>{t('dashboard.bank')}</th>
                  <th className="num">{t('dashboard.balance')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link to={`/banks/${b.id}`}>{b.title}</Link>
                    </td>
                    <td>{b.bankName || '—'}</td>
                    <td className={`num ${b.balance < 0 ? 'debit' : 'credit'}`}>{fmtMoney(b.balance)}</td>
                    <td>
                      <Link className="btn ghost sm" to={`/banks/${b.id}`}>
                        {t('banks.openLedger')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
