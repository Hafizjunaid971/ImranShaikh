import { Routes, Route, Navigate } from 'react-router-dom';
import Layout, { Protected } from './components/Layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DailySheet from './pages/DailySheet';
import Customers from './pages/Customers';
import CustomerLedger from './pages/CustomerLedger';
import Suppliers from './pages/Suppliers';
import SupplierLedger from './pages/SupplierLedger';
import Banks from './pages/Banks';
import BankLedger from './pages/BankLedger';
import PartyLedger from './pages/PartyLedger';
import Reports from './pages/Reports';
import Users from './pages/Users';
import ImportExcel from './pages/ImportExcel';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="daily" element={<DailySheet />} />
        <Route path="daily/:date" element={<DailySheet />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerLedger />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="suppliers/:id" element={<SupplierLedger />} />
        <Route path="banks" element={<Banks />} />
        <Route path="banks/:id" element={<BankLedger />} />
        <Route path="party" element={<PartyLedger />} />
        <Route path="party/:party" element={<PartyLedger />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        {/* <Route path="import" element={<ImportExcel />} /> */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
