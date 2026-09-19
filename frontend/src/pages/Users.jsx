import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const BLANK = { name: '', username: '', password: '', role: 'operator' };

export default function Users() {
  const { t } = useLang();
  const ROLES = t('users.roles');
  const { toast, show, clear } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const load = () => {
    setLoading(true);
    api
      .get('/users')
      .then(({ data }) => setRows(data.data))
      .catch((e) => show(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form.id) await api.put(`/users/${form.id}`, form);
      else await api.post('/users', form);
      show(t('common.save'));
      setForm(null);
      load();
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/auth/change-password', pw);
      show(data.message);
      setPw({ currentPassword: '', newPassword: '' });
    } catch (err) {
      show(errMsg(err), 'error');
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('users.title')}</h1>
          <div className="sub">{t('users.subtitle')}</div>
        </div>
        <button className="btn" onClick={() => setForm({ ...BLANK })}>
          {t('users.newUser')}
        </button>
      </div>

      {form && (
        <form className="card" onSubmit={save} style={{ marginBottom: '1rem' }}>
          <div className="card-title">{form.id ? t('users.editUser') : t('users.newUser')}</div>
          <div className="field-row">
            <div className="field">
              <label>{t('users.name')}</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {!form.id && (
              <div className="field">
                <label>{t('users.username')}</label>
                <input
                  required
                  className="num"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
            )}
            <div className="field">
              <label>{form.id ? t('users.passwordEditHint') : t('users.password')}</label>
              <input
                type="password"
                required={!form.id}
                value={form.password || ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="field" style={{ maxWidth: 160 }}>
              <label>{t('users.role')}</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
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
          <Empty>{t('users.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('users.name')}</th>
                  <th>{t('users.username')}</th>
                  <th>{t('users.role')}</th>
                  <th>{t('users.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className={u.isActive ? '' : 'dim'}>
                    <td>{u.name}</td>
                    <td className="num">{u.username}</td>
                    <td>{ROLES[u.role]}</td>
                    <td>
                      <span className={`chip ${u.isActive ? 'ok' : 'warn'}`}>
                        {u.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="split">
                      <button className="btn ghost sm" onClick={() => setForm({ ...u, password: '' })}>
                        {t('common.edit')}
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={async () => {
                          await api.put(`/users/${u.id}`, { isActive: !u.isActive });
                          load();
                        }}
                      >
                        {u.isActive ? t('users.disable') : t('users.enable')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className="card" onSubmit={changePw}>
        <div className="card-title">{t('users.changePassword')}</div>
        <div className="field-row">
          <div className="field">
            <label>{t('users.currentPassword')}</label>
            <input
              type="password"
              required
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
          </div>
          <div className="field">
            <label>{t('users.newPassword')}</label>
            <input
              type="password"
              required
              minLength={6}
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>&nbsp;</label>
            <button className="btn">{t('users.change')}</button>
          </div>
        </div>
      </form>
    </>
  );
}
