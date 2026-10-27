import { useRef, useState } from 'react';
import api, { errMsg, fmtMoney, fmtNum } from '../api/client';
import useToast from '../components/useToast';
import { Toast, Empty } from '../components/Layout';
import { useLang } from '../i18n/LangContext';

const MAX_BYTES = 3 * 1024 * 1024; // base64 کے بعد ~4MB — سرور کی حد کے اندر

/** فائل → base64 (بغیر data: سابقہ) */
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });

export default function ImportExcel() {
  const { t } = useLang();
  const { toast, show, clear } = useToast();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [data64, setData64] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null); // preview کا نتیجہ
  const [result, setResult] = useState(null); // commit کا نتیجہ
  const [opts, setOpts] = useState({ importDaily: true, importLedgers: true, updateCustomerNames: true });

  const reset = () => {
    setFile(null);
    setData64('');
    setPlan(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return show(t('import.errNotXlsx'), 'error');
    if (f.size > MAX_BYTES) return show(t('import.errTooBig'), 'error');

    setResult(null);
    setPlan(null);
    setFile(f);
    setBusy(true);
    try {
      const b64 = await toBase64(f);
      setData64(b64);
      const { data } = await api.post('/import/preview', { fileName: f.name, data: b64 }, { timeout: 120000 });
      setPlan(data.data);
    } catch (err) {
      show(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!window.confirm(t('import.confirm'))) return;
    setBusy(true);
    try {
      const { data } = await api.post(
        '/import/commit',
        { fileName: file.name, data: data64, options: opts },
        { timeout: 180000 }
      );
      setResult(data.data);
      setPlan(null);
      show(data.message);
    } catch (err) {
      show(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const nothingNew = plan && plan.totals.newSheets === 0 && plan.totals.newLedgerRows === 0;
  const kindLabel = (k) => t(`import.kind.${k}`);

  return (
    <>
      <Toast toast={toast} onClose={clear} />

      <div className="page-head">
        <div>
          <h1>{t('import.title')}</h1>
          <div className="sub">{t('import.subtitle')}</div>
        </div>
        {(file || result) && (
          <button className="btn ghost" onClick={reset} disabled={busy}>
            {t('import.another')}
          </button>
        )}
      </div>

      {/* ------------------------------------------------ فائل منتخب کریں */}
      {!result && (
        <div className="card">
          <div className="card-title">{t('import.step1')}</div>
          <div className="field-row">
            <div className="field">
              <input ref={inputRef} type="file" accept=".xlsx" onChange={onPick} disabled={busy} />
              <div className="muted" style={{ fontSize: '.84rem', marginTop: '.4rem' }}>
                {t('import.fileHint')}
              </div>
            </div>
          </div>
          {busy && !plan && <div className="loading">{t('import.analyzing')}</div>}
        </div>
      )}

      {/* ------------------------------------------------------ جائزہ */}
      {plan && (
        <>
          <div className="grid grid-4" style={{ marginTop: '1rem' }}>
            <div className="stat gold">
              <div className="stat-label">{t('import.stat.newSheets')}</div>
              <div className="stat-value num">{plan.totals.newSheets}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('import.stat.existingSheets')}</div>
              <div className="stat-value num">{plan.totals.existingSheets}</div>
              <div className="stat-note">{t('import.stat.skipNote')}</div>
            </div>
            <div className="stat gold">
              <div className="stat-label">{t('import.stat.newRows')}</div>
              <div className="stat-value num">{plan.totals.newLedgerRows}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('import.stat.dupRows')}</div>
              <div className="stat-value num">{plan.totals.duplicateLedgerRows}</div>
              <div className="stat-note">{t('import.stat.skipNote')}</div>
            </div>
          </div>

          {plan.warnings.length > 0 && (
            <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--debit)' }}>
              <div className="card-title" style={{ color: 'var(--debit)' }}>
                {t('import.warnings')}
              </div>
              <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* روزانہ شیٹیں */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('import.daily.title')}</div>
            {plan.daily.length === 0 ? (
              <Empty>{t('import.daily.none')}</Empty>
            ) : (
              <div className="table-wrap" style={{ maxHeight: '38vh' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('common.date')}</th>
                      <th>{t('import.daily.status')}</th>
                      <th className="num">{t('import.daily.weight')}</th>
                      <th className="num">{t('import.daily.amount')}</th>
                      <th className="num">{t('import.daily.recovery')}</th>
                      <th className="num">{t('import.daily.active')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.daily.map((s) => (
                      <tr key={s.date} style={s.status === 'exists' ? { opacity: 0.6 } : undefined}>
                        <td className="num">{s.date}</td>
                        <td>
                          <span className={`pill ${s.status === 'new' ? 'ok' : 'skip'}`}>
                            {s.status === 'new' ? t('import.daily.new') : t('import.daily.exists')}
                          </span>
                        </td>
                        <td className="num">{fmtNum(s.weight, 1)}</td>
                        <td className="num">{fmtMoney(s.amount)}</td>
                        <td className="num">{fmtMoney(s.recovery)}</td>
                        <td className="num">{s.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* گاہکوں کے نام */}
          {(plan.customers.renamed.length > 0 || plan.customers.created.length > 0) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">{t('import.customers.title')}</div>

              {plan.customers.renamed.length > 0 && (
                <>
                  <div className="muted" style={{ marginBottom: '.5rem' }}>
                    {t('import.customers.renamedHint')}
                  </div>
                  <div className="table-wrap" style={{ maxHeight: '30vh' }}>
                    <table>
                      <thead>
                        <tr>
                          <th className="num">{t('import.customers.slot')}</th>
                          <th>{t('import.customers.dbName')}</th>
                          <th>{t('import.customers.excelName')}</th>
                          <th>{t('import.customers.result')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.customers.renamed.map((r) => (
                          <tr key={r.slot}>
                            <td className="num">{r.slot}</td>
                            <td>{r.dbName}</td>
                            <td>
                              {r.names.map((n) => (
                                <div key={n.name}>
                                  {n.name}{' '}
                                  <span className="muted num" style={{ fontSize: '.78rem' }}>
                                    ({n.from.slice(5)}
                                    {n.to !== n.from ? ` → ${n.to.slice(5)}` : ''})
                                  </span>
                                </div>
                              ))}
                            </td>
                            <td>
                              {r.finalName ? (
                                <span className={`pill ${opts.updateCustomerNames ? 'ok' : 'skip'}`}>
                                  {opts.updateCustomerNames ? t('import.customers.willUpdate') : t('import.customers.keepOld')}
                                </span>
                              ) : (
                                <span className="pill skip">{t('import.customers.tempOnly')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {plan.customers.created.length > 0 && (
                <>
                  <div className="muted" style={{ margin: '.8rem 0 .4rem' }}>
                    {t('import.customers.createdHint')}
                  </div>
                  <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
                    {plan.customers.created.map((c) => (
                      <li key={c.name}>
                        {c.name} — {t('import.customers.openingBalance')}: <span className="num">{fmtMoney(c.openingBalance)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* لیجر */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('import.ledgers.title')}</div>
            {plan.ledgers.length === 0 ? (
              <Empty>{t('import.ledgers.none')}</Empty>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('import.ledgers.kind')}</th>
                      <th>{t('import.ledgers.target')}</th>
                      <th className="num">{t('import.ledgers.total')}</th>
                      <th className="num">{t('import.ledgers.new')}</th>
                      <th className="num">{t('import.ledgers.dup')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.ledgers.map((l) => (
                      <tr key={l.sheetName}>
                        <td>{kindLabel(l.kind)}</td>
                        <td>
                          {l.target || <span className="muted">{l.sheetName}</span>}
                          {l.isNewParty && <span className="pill warn" style={{ marginInlineStart: '.4rem' }}>{t('import.ledgers.newParty')}</span>}
                          {l.warning && <div style={{ color: 'var(--debit)', fontSize: '.84rem' }}>{l.warning}</div>}
                          {l.sample.length > 0 && (
                            <details style={{ marginTop: '.3rem' }}>
                              <summary className="muted" style={{ cursor: 'pointer', fontSize: '.84rem' }}>
                                {t('import.ledgers.sample')}
                              </summary>
                              <table style={{ marginTop: '.3rem' }}>
                                <tbody>
                                  {l.sample.map((s, i) => (
                                    <tr key={i}>
                                      <td className="num">{s.date.slice(5)}</td>
                                      <td style={{ maxWidth: 320 }}>{s.text}</td>
                                      <td className="num">{s.in ? fmtMoney(s.in) : ''}</td>
                                      <td className="num">{s.out ? fmtMoney(s.out) : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          )}
                        </td>
                        <td className="num">{l.total}</td>
                        <td className="num">
                          <b>{l.newCount}</b>
                        </td>
                        <td className="num muted">{l.duplicates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* اختیارات + امپورٹ */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('import.step2')}</div>
            <div style={{ display: 'grid', gap: '.4rem', marginBottom: '1rem' }}>
              <label className="split">
                <input type="checkbox" checked={opts.importDaily} onChange={(e) => setOpts({ ...opts, importDaily: e.target.checked })} />
                {t('import.opt.daily')}
              </label>
              <label className="split">
                <input type="checkbox" checked={opts.importLedgers} onChange={(e) => setOpts({ ...opts, importLedgers: e.target.checked })} />
                {t('import.opt.ledgers')}
              </label>
              <label className="split">
                <input
                  type="checkbox"
                  checked={opts.updateCustomerNames}
                  disabled={!opts.importDaily}
                  onChange={(e) => setOpts({ ...opts, updateCustomerNames: e.target.checked })}
                />
                {t('import.opt.rename')}
              </label>
            </div>

            {nothingNew && <div className="muted" style={{ marginBottom: '.7rem' }}>{t('import.nothingNew')}</div>}

            <button
              className="btn gold"
              onClick={commit}
              disabled={busy || nothingNew || (!opts.importDaily && !opts.importLedgers)}
            >
              {busy ? t('import.importing') : t('import.importBtn')}
            </button>
          </div>
        </>
      )}

      {/* ------------------------------------------------------ نتیجہ */}
      {result && (
        <>
          <div className="grid grid-4">
            <div className="stat gold">
              <div className="stat-label">{t('import.result.sheets')}</div>
              <div className="stat-value num">{result.daily.sheetsCreated}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('import.result.skipped')}</div>
              <div className="stat-value num">{result.daily.sheetsSkipped}</div>
            </div>
            <div className="stat gold">
              <div className="stat-label">{t('import.result.rows')}</div>
              <div className="stat-value num">{result.ledgers.reduce((s, l) => s + l.added, 0)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('import.result.dups')}</div>
              <div className="stat-value num">{result.ledgers.reduce((s, l) => s + l.duplicates, 0)}</div>
            </div>
          </div>

          {result.daily.verify && result.daily.verify.checkedRows > 0 && (
            <div className="card" style={{ marginTop: '1rem', borderColor: result.daily.verify.ok ? 'var(--credit)' : 'var(--debit)' }}>
              <div className="card-title" style={{ color: result.daily.verify.ok ? 'var(--credit)' : 'var(--debit)' }}>
                {result.daily.verify.ok ? t('import.result.verifyOk') : t('import.result.verifyBad')}
              </div>
              <div>
                {t('import.result.checked')}: <span className="num">{result.daily.verify.checkedRows}</span> —{' '}
                {t('import.result.mismatch')}: <span className="num">{result.daily.verify.mismatchedRows}</span>
              </div>
              {!result.daily.verify.ok && (
                <>
                  <div className="muted" style={{ margin: '.4rem 0' }}>{t('import.result.verifyHint')}</div>
                  <table>
                    <thead>
                      <tr>
                        <th>{t('common.date')}</th>
                        <th className="num">{t('import.result.mismatch')}</th>
                        <th className="num">Excel</th>
                        <th className="num">App</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.daily.verify.sheets.map((s) => (
                        <tr key={s.date}>
                          <td className="num">{s.date}</td>
                          <td className="num">{s.mismatches}</td>
                          <td className="num">{fmtMoney(s.excelClosing)}</td>
                          <td className="num">{fmtMoney(s.appClosing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('import.ledgers.title')}</div>
            <div className="table-wrap" style={{ maxHeight: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('import.ledgers.kind')}</th>
                    <th>{t('import.ledgers.target')}</th>
                    <th className="num">{t('import.result.added')}</th>
                    <th className="num">{t('import.ledgers.dup')}</th>
                    <th>{t('import.result.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ledgers.map((l) => (
                    <tr key={l.sheetName}>
                      <td>{kindLabel(l.kind)}</td>
                      <td>{l.target || l.sheetName}</td>
                      <td className="num">{l.added}</td>
                      <td className="num muted">{l.duplicates}</td>
                      <td>
                        {l.warning ? (
                          <span style={{ color: 'var(--debit)' }}>{l.warning}</span>
                        ) : l.balanceCheck ? (
                          <>
                            <span className={`pill ${l.balanceCheck.ok ? 'ok' : 'warn'}`}>
                              {l.balanceCheck.ok ? t('import.result.balanceOk') : t('import.result.balanceDiff')}
                            </span>{' '}
                            <span className="num muted" style={{ fontSize: '.8rem' }}>
                              App {fmtMoney(l.balanceCheck.app)} / Excel {fmtMoney(l.balanceCheck.excel)}
                            </span>
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(result.daily.customersRenamed > 0 || result.daily.customersCreated > 0 || result.daily.cascaded > 0 || result.daily.notes.length > 0) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
                {result.daily.customersRenamed > 0 && <li>{t('import.result.renamed')}: <span className="num">{result.daily.customersRenamed}</span></li>}
                {result.daily.customersCreated > 0 && <li>{t('import.result.created')}: <span className="num">{result.daily.customersCreated}</span></li>}
                {result.daily.cascaded > 0 && <li>{t('import.result.cascaded')}: <span className="num">{result.daily.cascaded}</span></li>}
                {result.daily.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
