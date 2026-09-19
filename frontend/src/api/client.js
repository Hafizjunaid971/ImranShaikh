import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!location.pathname.includes('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/** سرور کے اردو پیغام کو سیدھا نکالنے کے لیے */
export const errMsg = (e) =>
  e?.response?.data?.message || e?.message || 'کچھ غلط ہو گیا';

/* ------------------------------------------------------------- formatting */

export const fmtMoney = (n, dp = 0) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtNum = (n, dp = 2) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { maximumFractionDigits: dp });
};

export const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const today = () => new Date().toISOString().slice(0, 10);

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default api;
