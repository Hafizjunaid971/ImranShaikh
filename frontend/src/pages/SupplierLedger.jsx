import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMsg, fmtMoney, fmtNum, today } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { date: today(), vehicleNo: '', weight: 0, rate: 0, paid: 0, description: '' };

export default function SupplierLedger() {
  const { t } = useLang();
  const { id } = useParams();
  const { can } = useAuth();
  const { toast, show, clear } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get(`/ledger/supplier/${id}`)
      .then(({ data }) => setData(data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/ledger/supplier/${id}/${editingId}`, form);
        show(t('common.save'));
      } else {
        await api.post(`/ledger/supplier/${id}`, form);
        show(t('supplierLedger.entrySubmit'));
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
      vehicleNo: row.vehicleNo || '',
      weight: row.weight || 0,
      rate: row.rate || 0,
      paid: row.paid || 0,
      description: row.description || '',
    });
    document.getElementById('supplier-entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...BLANK });
  };

  const del = async (txnId) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/ledger/supplier/${id}/${txnId}`);
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
          <h1>{data.supplier.name}</h1>
          <div className="sub">
            {data.supplier.city || ''} · <Link to="/suppliers">{t('supplierLedger.allSuppliers')}</Link>
          </div>
        </div>
        <button className="btn ghost" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">{t('supplierLedger.openingBalance')}</div>
          <div className="stat-value">{fmtMoney(s.openingBalance)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('suppliers.totalWeight')}</div>
          <div className="stat-value">{fmtNum(s.totalWeight, 1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('suppliers.totalAmount')}</div>
          <div className="stat-value">{fmtMoney(s.totalAmount)}</div>
          <div className="stat-note">{t('suppliers.paid')} {fmtMoney(s.totalPaid)}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">{t('suppliers.balance')}</div>
          <div className="stat-value">{fmtMoney(s.closingBalance)}</div>
        </div>
      </div>

      {can('admin', 'manager', 'operator') && (
        <form id="supplier-entry-form" className="card" onSubmit={add} style={{ marginTop: '1rem' }}>
          <div className="card-title">{editingId ? t('common.edit') : t('supplierLedger.newEntry')}</div>
          <div className="field-row">
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('common.date')}</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 100 }}>
              <label>{t('daily.vehicle')}</label>
              <input value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 120 }}>
              <label>{t('supplierLedger.weight')}</label>
              <input
                className="num"
                type="number"
                step="any"
                value={form.weight || ''}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>{t('supplierLedger.rate')}</label>
              <input
                className="num"
                type="number"
                step="any"
                value={form.rate || ''}
                onChange={(e) => setForm({ ...form, rate: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ maxWidth: 140 }}>
              <label>{t('suppliers.paid')}</label>
              <input
                className="num"
                type="number"
                step="any"
                value={form.paid || ''}
                onChange={(e) => setForm({ ...form, paid: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field">
              <label>{t('supplierLedger.description')}</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <div className="split">
                <button className="btn gold">{editingId ? t('common.save') : t('supplierLedger.entrySubmit')}</button>
                {editingId && (
                  <button type="button" className="btn ghost" onClick={cancelEdit}>
                    {t('common.cancel')}
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '.84rem', margin: '.5rem 0 0' }}>
            {t('supplierLedger.formula')}
          </p>
        </form>
      )}

      <div className="card">
        <div className="card-title">{t('supplierLedger.account')}</div>
        {data.rows.length === 0 ? (
          <Empty>{t('supplierLedger.empty')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('daily.vehicle')}</th>
                  <th className="num">{t('supplierLedger.weight')}</th>
                  <th className="num">{t('supplierLedger.rate')}</th>
                  <th className="num">{t('supplierLedger.amount')}</th>
                  <th className="num">{t('supplierLedger.prevBalance')}</th>
                  <th className="num">{t('supplierLedger.total')}</th>
                  <th className="num">{t('suppliers.paid')}</th>
                  <th className="num">{t('supplierLedger.balance')}</th>
                  <th>{t('supplierLedger.description')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r._id}>
                    <td className="num">{new Date(r.date).toISOString().slice(0, 10)}</td>
                    <td className="num">{r.vehicleNo || '—'}</td>
                    <td className="num">{fmtNum(r.weight, 1)}</td>
                    <td className="num">{fmtNum(r.rate, 0)}</td>
                    <td className="num">{fmtMoney(r.amount)}</td>
                    <td className="num muted">{fmtMoney(r.previousBalance)}</td>
                    <td className="num">{fmtMoney(r.total)}</td>
                    <td className="num credit">{fmtMoney(r.paid)}</td>
                    <td className="num debit">{fmtMoney(r.balance)}</td>
                    <td style={{ minWidth: 200 }}>{r.description || '—'}</td>
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
                  <td colSpan={2}>{t('common.total')}</td>
                  <td className="num">{fmtNum(s.totalWeight, 1)}</td>
                  <td />
                  <td className="num">{fmtMoney(s.totalAmount)}</td>
                  <td colSpan={2} />
                  <td className="num">{fmtMoney(s.totalPaid)}</td>
                  <td className="num">{fmtMoney(s.closingBalance)}</td>
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
