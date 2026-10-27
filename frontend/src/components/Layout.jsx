import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';

export function Protected({ children }) {
  const { user, booting } = useAuth();
  const { t } = useLang();
  if (booting) return <div className="loading">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** 🌐 آئیکن — EN/UR ٹوگل۔ کہیں بھی جگہ دیں، sidebar کے علاوہ بھی۔ */
export function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      className={`btn ghost sm lang-toggle ${className}`}
      onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
      title={lang === 'ur' ? 'Switch to English' : 'اردو میں دیکھیں'}
    >
      🌐 {lang === 'ur' ? 'EN' : 'اردو'}
    </button>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { t } = useLang();

  /* آئیکن + لیبل — ترتیب وہی جو nav میں دکھنی ہے */
  const LINKS = [
    { to: '/', key: 'dashboard', end: true },
    { to: '/daily', key: 'daily' },
    { to: '/customers', key: 'customers' },
    { to: '/suppliers', key: 'suppliers' },
    { to: '/banks', key: 'banks' },
    { to: '/party', key: 'party' },
    { to: '/reports', key: 'reports' },
  ];

  return (
    <div className="shell">
      {/* nav یہاں main سے پہلے ہے — اسی لیے RTL میں خود دائیں پر، LTR میں خود بائیں پر آ جاتا ہے */}
      <nav className="nav">
        <div className="nav-brand split" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('nav.brand')}</span>
        </div>

        <div style={{ padding: '0 .6rem .7rem' }}>
          <LangToggle className="w-full" />
        </div>

        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            {t(`nav.${l.key}`)}
          </NavLink>
        ))}
        {can('admin', 'manager') && <NavLink to="/import">{t('nav.import')}</NavLink>}
        {can('admin') && <NavLink to="/users">{t('nav.users')}</NavLink>}

        <div className="nav-foot">
          <div>{user?.name}</div>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            {t(`users.roles.${user?.role}`)}
          </div>
          <button
            className="btn ghost sm"
            style={{ marginTop: '.5rem', color: '#c3d0dc', borderColor: '#46596c' }}
            onClick={logout}
          >
            {t('common.logout')}
          </button>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

/* ---------------------------------------------------------- small helpers */

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type === 'error' ? 'err' : ''}`} onClick={onClose} role="status">
      {toast.message}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
