import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, fmtMoney, today } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { date: today(), reference: '', debit: 0, credit: 0 };

export default function PartyLedger() {
  const { t } = useLang();
  const { party: routeParty } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { toast, show, clear } = useToast();

  const [parties, setParties] = useState([]);
  const [party, setParty] = useState(routeParty ? decodeURIComponent(routeParty) : '');
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState(null); // null = نیا اندراج، ورنہ اُس _id کی ترمیم

  useEffect(() => {
    api
      .get('/ledger/parties')
      .then(({ data }) => {
        setParties(data.data);
        if (!party && data.data.length) {
          setParty(data.data[0]);
          navigate(`/party/${encodeURIComponent(data.data[0])}`, { replace: true });
        }
      })
      .catch((e) => show(errMsg(e), 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = (p = party) => {
    if (!p) return;
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
    api
      .get(`/ledger/party/${encodeURIComponent(p)}${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setData(data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(party);
  }, [party]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    if (!party) return show(t('party.selectFirstError'), 'error');
    try {
      if (editingId) {
        await api.put(`/ledger/party/${encodeURIComponent(party)}/${editingId}`, form);
        show(t('common.save'));
      } else {
        await api.post(`/ledger/party/${encodeURIComponent(party)}`, form);
        show(t('party.entrySubmit'));
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
      debit: row.debit || 0,
      credit: row.credit || 0,
    });
    // فارم تک نظر لے جائیں تاکہ یوزر کو پتا چلے وہ ترمیم کر رہا ہے
    document.getElementById('party-entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...BLANK });
  };

  const del = async (txnId) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/ledger/party/${encodeURIComponent(party)}/${txnId}`);
      show(t('common.delete'));
      load();
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  const newParty = () => {
    const name = prompt(t('party.newPartyPrompt'));
    if (!name) return;
    setParties((p) => [...new Set([...p, name])]);
    setParty(name);
    navigate(`/party/${encodeURIComponent(name)}`, { replace: true });
  };

  const s = data?.summary;

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('party.title')}</h1>
          <div className="sub">{t('party.subtitle')}</div>
        </div>
        <div className="split">
          <select
            style={{ width: 210 }}
            value={party}
            onChange={(e) => {
              setParty(e.target.value);
              navigate(`/party/${encodeURIComponent(e.target.value)}`, { replace: true });
            }}
          >
            <option value="">{t('party.choosePartyOption')}</option>
            {parties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {can('admin', 'manager') && (
            <button className="btn ghost" onClick={newParty}>
              {t('party.newParty')}
            </button>
          )}
          <div>
            <label>{t('common.from')}</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div>
            <label>{t('common.to')}</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <button className="btn" onClick={() => load()}>
            {t('common.show')}
          </button>
          <button className="btn ghost" onClick={() => window.print()}>
            {t('common.print')}
          </button>
        </div>
      </div>

      {s && (
        <div className="grid grid-4">
          <div className="stat">
            <div className="stat-label">{t('party.opening')}</div>
            <div className="stat-value">{fmtMoney(s.openingBalance)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('party.totalDeposit')}</div>
            <div className="stat-value credit">{fmtMoney(s.totalDebit)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('party.totalExpense')}</div>
            <div className="stat-value debit">{fmtMoney(s.totalCredit)}</div>
          </div>
          <div className="stat gold">
            <div className="stat-label">{t('party.currentBalance')}</div>
            <div className="stat-value">{fmtMoney(s.closingBalance)}</div>
          </div>
        </div>
      )}

      {party && can('admin', 'manager', 'operator') && (
        <form id="party-entry-form" className="card" onSubmit={add} style={{ marginTop: '1rem' }}>
          <div className="card-title">
            {editingId ? t('common.edit') : t('party.newEntry')} — {party}
          </div>
          <div className="field-row">
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('common.date')}</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>{t('party.reference')}</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('party.deposit')}</label>
              <input
                className="num"
                type="number"
                value={form.debit || ''}
                onChange={(e) => setForm({ ...form, debit: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>{t('party.expense')}</label>
              <input
                className="num"
                type="number"
                value={form.credit || ''}
                onChange={(e) => setForm({ ...form, credit: Number(e.target.value || 0) })}
              />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <div className="split">
                <button className="btn gold">{editingId ? t('common.save') : t('party.entrySubmit')}</button>
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
        <div className="card-title">
          {t('party.ledger')} {party && `— ${party}`}
        </div>
        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : !data || data.rows.length === 0 ? (
          <Empty>{t('party.empty')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th className="num">{t('party.sale')}</th>
                  <th className="num">{t('party.recovery')}</th>
                  <th className="num">{t('party.deposit')}</th>
                  <th className="num">{t('party.expense')}</th>
                  <th>{t('party.reference')}</th>
                  <th className="num">{t('party.currentBalance')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r._id} className={r.isBlankRow ? 'dim' : ''}>
                    <td className="num">{new Date(r.date).toISOString().slice(0, 10)}</td>
                    <td className="num muted">{r.saleAmount ? fmtMoney(r.saleAmount) : '—'}</td>
                    <td className="num muted">{r.recoveryAmount ? fmtMoney(r.recoveryAmount) : '—'}</td>
                    <td className="num credit">{r.debit ? fmtMoney(r.debit) : '—'}</td>
                    <td className="num debit">{r.credit ? fmtMoney(r.credit) : '—'}</td>
                    <td style={{ minWidth: 260 }}>{r.reference || '—'}</td>
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
                  <td className="num">{fmtMoney(s.totalDebit)}</td>
                  <td className="num">{fmtMoney(s.totalCredit)}</td>
                  <td />
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
