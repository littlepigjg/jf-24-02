import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import Dashboard from "@/pages/Dashboard";
import QrCodeList from "@/pages/QrCodeList";
import QrCodeCreate from "@/pages/QrCodeCreate";
import QrCodeEdit from "@/pages/QrCodeEdit";
import QrCodeStats from "@/pages/QrCodeStats";
import BatchGenerator from "@/pages/BatchGenerator";
import ExportCenter from "@/pages/ExportCenter";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="qrcodes" element={<QrCodeList />} />
          <Route path="qrcodes/new" element={<QrCodeCreate />} />
          <Route path="qrcodes/:id/edit" element={<QrCodeEdit />} />
          <Route path="qrcodes/:id/stats" element={<QrCodeStats />} />
          <Route path="batch" element={<BatchGenerator />} />
          <Route path="export" element={<ExportCenter />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
