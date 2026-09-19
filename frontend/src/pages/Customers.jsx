import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, fmtMoney } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { name: '', area: '', phone: '', openingBalance: 0, isActive: true };

export default function Customers() {
  const { t } = useLang();
  const { can } = useAuth();
  const { toast, show, clear } = useToast();
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get('/customers')
      .then(({ data }) => setList(data.data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => list.filter((c) => !q || c.name.includes(q) || (c.area || '').includes(q)),
    [list, q]
  );

  const total = rows.reduce((t2, c) => t2 + Number(c.currentBalance || 0), 0);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form._id) await api.put(`/customers/${form._id}`, form);
      else await api.post('/customers', form);
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
          <h1>{t('customers.title')}</h1>
          <div className="sub">
            {t('customers.countSummary', rows.length)} <span className="num debit">{fmtMoney(total)}</span>
          </div>
        </div>
        <div className="split">
          <input
            placeholder={t('customers.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 190 }}
          />
          {can('admin', 'manager') && (
            <button className="btn" onClick={() => setForm({ ...BLANK })}>
              {t('customers.newCustomer')}
            </button>
          )}
        </div>
      </div>

      {form && (
        <form className="card" onSubmit={save} style={{ marginBottom: '1rem' }}>
          <div className="card-title">{form._id ? t('customers.editCustomer') : t('customers.newCustomer')}</div>
          <div className="field-row">
            <div className="field">
              <label>{t('customers.name')}</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('customers.area')}</label>
              <input value={form.area || ''} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('customers.phone')}</label>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('customers.openingBalance')}</label>
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
          {form._id && (
            <p className="muted" style={{ fontSize: '.84rem', margin: '.6rem 0 0' }}>
              {t('customers.openingBalanceWarn')}
            </p>
          )}
        </form>
      )}

      <div className="card">
        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <Empty>{t('customers.noneFound')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>{t('customers.name')}</th>
                  <th>{t('customers.area')}</th>
                  <th>{t('customers.phone')}</th>
                  <th className="num">{t('customers.openingBalance')}</th>
                  <th className="num">{t('customers.currentBalance')}</th>
                  <th className="num">{t('customers.lastBusiness')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c._id} className={c.isActive ? '' : 'dim'}>
                    <td className="muted num">{i + 1}</td>
                    <td>
                      <Link to={`/customers/${c._id}`}>{c.name}</Link>
                    </td>
                    <td>{c.area || '—'}</td>
                    <td className="num">{c.phone || '—'}</td>
                    <td className="num muted">{fmtMoney(c.openingBalance)}</td>
                    <td className={`num ${c.currentBalance > 0 ? 'debit' : 'credit'}`}>
                      {fmtMoney(c.currentBalance)}
                    </td>
                    <td className="num muted">
                      {c.lastActivity ? new Date(c.lastActivity).toISOString().slice(0, 10) : '—'}
                    </td>
                    <td>
                      {can('admin', 'manager') && (
                        <button className="btn ghost sm" onClick={() => setForm({ ...c })}>
                          {t('common.edit')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{t('common.total')}</td>
                  <td className="num debit">{fmtMoney(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
