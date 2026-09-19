import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import ur from './ur';
import en from './en';

const DICTS = { ur, en };
const LangContext = createContext(null);

/** خانوں کی زنجیر — 'daily.col.name' → dict.daily.col.name */
function resolve(dict, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ur');

  useEffect(() => {
    localStorage.setItem('lang', lang);
    const dict = DICTS[lang];
    document.documentElement.dir = dict.dir;
    document.documentElement.lang = lang === 'ur' ? 'ur' : 'en';
    document.body.classList.toggle('lang-en', lang === 'en');
    document.body.classList.toggle('lang-ur', lang === 'ur');
  }, [lang]);

  const value = useMemo(() => {
    const dict = DICTS[lang];
    /** t('daily.col.name') یا فنکشن والی چابی کے لیے t('dashboard.daysSummary', 5) */
    const t = (path, ...args) => {
      const v = resolve(dict, path);
      if (typeof v === 'function') return v(...args);
      if (v === undefined) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${path}`);
        return path;
      }
      return v;
    };
    return { lang, setLang, dir: dict.dir, t };
  }, [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
