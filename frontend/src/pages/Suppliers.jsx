import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, fmtMoney, fmtNum } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { name: '', kind: 'aarti', city: '', vehicleNo: '', openingBalance: 0, showInDailySheet: true };

export default function Suppliers() {
  const { t } = useLang();
  const KINDS = t('suppliers.kinds');
  const { can } = useAuth();
  const { toast, show, clear } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get('/reports/suppliers')
      .then(({ data }) => setRows(data.data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form._id) await api.put(`/suppliers/${form._id}`, form);
      else await api.post('/suppliers', form);
      show(t('common.save'));
      setForm(null);
      load();
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  const total = rows.reduce((t2, r) => t2 + Number(r.balance || 0), 0);

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('suppliers.title')}</h1>
          <div className="sub">
            {rows.length} {t('suppliers.countSummary')} <span className="num">{fmtMoney(total)}</span>
          </div>
        </div>
        {can('admin', 'manager') && (
          <button className="btn" onClick={() => setForm({ ...BLANK })}>
            {t('suppliers.newSupplier')}
          </button>
        )}
      </div>

      {form && (
        <form className="card" onSubmit={save} style={{ marginBottom: '1rem' }}>
          <div className="card-title">{form._id ? t('suppliers.edit') : t('suppliers.newSupplier')}</div>
          <div className="field-row">
            <div className="field">
              <label>{t('suppliers.name')}</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 140 }}>
              <label>{t('suppliers.kind')}</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('suppliers.city')}</label>
              <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>{t('suppliers.vehicleNo')}</label>
              <input value={form.vehicleNo || ''} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('suppliers.openingBalance')}</label>
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
          <Empty>{t('suppliers.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('suppliers.name')}</th>
                  <th>{t('suppliers.kind')}</th>
                  <th>{t('suppliers.city')}</th>
                  <th className="num">{t('suppliers.totalWeight')}</th>
                  <th className="num">{t('suppliers.totalAmount')}</th>
                  <th className="num">{t('suppliers.paid')}</th>
                  <th className="num">{t('suppliers.balance')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/suppliers/${r.id}`}>{r.name}</Link>
                    </td>
                    <td>{KINDS[r.kind] || r.kind}</td>
                    <td>{r.city || '—'}</td>
                    <td className="num">{fmtNum(r.totalWeight, 1)}</td>
                    <td className="num">{fmtMoney(r.totalAmount)}</td>
                    <td className="num credit">{fmtMoney(r.totalPaid)}</td>
                    <td className={`num ${r.balance > 0 ? 'debit' : 'credit'}`}>{fmtMoney(r.balance)}</td>
                    <td>
                      {can('admin', 'manager') && (
                        <button
                          className="btn ghost sm"
                          onClick={() => setForm({ _id: r.id, name: r.name, kind: r.kind, city: r.city })}
                        >
                          {t('common.edit')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>{t('common.total')}</td>
                  <td className="num">{fmtMoney(total)}</td>
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
