import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationBell } from '../components/NotificationBell';

const CRUMBS: Record<string, string> = {
  '/requests': 'Requests',
  '/workflows': 'Design',
  '/forms': 'Design',
  '/notifications': 'Notifications',
};

const TITLES: Record<string, string> = {
  '/requests': 'Request list',
  '/workflows': 'Workflow list',
  '/forms': 'Form list',
  '/notifications': 'Notifications',
};

function currentCrumb(pathname: string) {
  const match = Object.keys(CRUMBS).find((p) => pathname.startsWith(p));
  return { crumb: match ? CRUMBS[match] : 'FlowForm', title: match ? TITLES[match] : '' };
}

export function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { crumb, title } = currentCrumb(location.pathname);

  const navClass = ({ isActive }: { isActive: boolean }) => `ff-nav-i${isActive ? ' on' : ''}`;
  const initials = (user?.email ?? '??').slice(0, 2).toUpperCase();

  return (
    <div className="ff-app">
      <aside className="ff-rail">
        <div className="ff-rail-top">
          <div className="ff-rail-mark">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <rect x="1" y="1" width="30" height="30" rx="3" stroke="#0E7E9E" strokeWidth="1.5" />
              <path d="M6 22h20M6 16h9M17 16h9M6 10h20" stroke="#0E7E9E" strokeWidth="1.5" />
              <path d="M13 13l3 3-3 3zM19 13l-3 3 3 3z" fill="#22B5DE" />
            </svg>
            <div>
              <b>FLOWFORM</b>
              <div className="sub">Request platform</div>
            </div>
          </div>
        </div>
        <nav className="ff-rail-nav">
          <div className="ff-nav-grp">Requests</div>
          <NavLink to="/requests" className={navClass}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            <span>Request list</span>
          </NavLink>
          <div className="ff-nav-grp">Design</div>
          <NavLink to="/workflows" className={navClass}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="6" height="6" rx="1" />
              <rect x="15" y="15" width="6" height="6" rx="1" />
              <path d="M6 9v6a2 2 0 0 0 2 2h7" />
            </svg>
            <span>Workflow list</span>
          </NavLink>
          <NavLink to="/forms" className={navClass}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M9 13h6M9 17h4" />
            </svg>
            <span>Form list</span>
          </NavLink>
        </nav>
        <div className="ff-rail-foot">MVP</div>
      </aside>

      <div className="ff-main">
        <header className="ff-topbar">
          <div className="crumb" style={{ fontFamily: 'var(--f-disp)', fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {crumb} <span style={{ opacity: 0.4 }}>/</span> <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{title}</b>
          </div>
          <div style={{ flex: 1 }} />
          <NotificationBell />
          <div className="ff-who">
            <div className="ff-av">{initials}</div>
            <div>
              <div className="nm">{user?.email}</div>
              <div className="rl">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-sm btn-outline-secondary" style={{ marginLeft: 10 }} onClick={logout}>
            Logout
          </button>
        </header>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div className="ff-page">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
