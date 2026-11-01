import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './admin/Layout';
import BookingsPage from './admin/Bookings';
import CalendarPage from './admin/Calendar';
import ClientsPage from './admin/Clients';
import Dashboard from './admin/Dashboard';
import Login from './admin/Login';
import ServicesPage from './admin/Services';
import { AuthProvider, RequireAuth } from './admin/auth';
import BookingPage from './booking/BookingPage';
import { ToastProvider } from './components/ui';

// HashRouter: GitHub Pages serves static files only, so deep links must not hit the server.
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<BookingPage />} />
            <Route path="/admin/login" element={<Login />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="services" element={<ServicesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
