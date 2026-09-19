import { createContext, useContext, useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return setBooting(false);
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('token');
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, []);

  const login = async (username, password) => {
    try {
      const { data } = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    location.href = '/login';
  };

  const can = (...roles) => !!user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, booting, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
