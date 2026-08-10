import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { NotificationsProvider } from './notifications/NotificationsContext';
import { ToastProvider } from './components/ToastContext';
import { ConfirmProvider } from './components/ConfirmContext';
import { Login } from './pages/Login';
import { Shell } from './pages/Shell';
import { RequestList } from './pages/RequestList';
import { RequestCreate } from './pages/RequestCreate';
import { RequestProcess } from './pages/RequestProcess';
import { WorkflowList } from './pages/WorkflowList';
import { WorkflowDesign } from './pages/WorkflowDesign';
import { FormList } from './pages/FormList';
import { FormDesign } from './pages/FormDesign';
import { NotificationList } from './pages/NotificationList';

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <NotificationsProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Shell />}>
                  <Route index element={<Navigate to="/requests" replace />} />
                  <Route path="requests" element={<RequestList />} />
                  <Route path="requests/new" element={<RequestCreate />} />
                  <Route path="requests/:id" element={<RequestProcess />} />
                  <Route path="workflows" element={<WorkflowList />} />
                  <Route path="workflows/:id" element={<WorkflowDesign />} />
                  <Route path="forms" element={<FormList />} />
                  <Route path="forms/:id" element={<FormDesign />} />
                  <Route path="notifications" element={<NotificationList />} />
                </Route>
              </Route>
            </Routes>
          </NotificationsProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
