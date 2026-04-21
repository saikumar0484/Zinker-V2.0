import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Video, Settings, LogOut, LayoutDashboard, History } from 'lucide-react';

export function Layout() {
  const { logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full shadow-sm z-10">
        <div className="p-6">
          <h1 className="text-xl font-extrabold flex items-center gap-2 text-indigo-900 uppercase tracking-tighter">
            <Video className="w-7 h-7 text-blue-600" />
            Zinker
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link to="/">
            <Button variant={(location.pathname === '/' || location.pathname === '/dashboard') ? 'secondary' : 'ghost'} className={`w-full justify-start font-bold ${(location.pathname === '/' || location.pathname === '/dashboard') ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}>
              <LayoutDashboard className="w-4 h-4 mr-3" />
              Dashboard
            </Button>
          </Link>
          <Link to="/history">
            <Button variant={location.pathname === '/history' ? 'secondary' : 'ghost'} className={`w-full justify-start font-bold ${location.pathname === '/history' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}>
              <History className="w-4 h-4 mr-3" />
              History
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant={location.pathname === '/settings' ? 'secondary' : 'ghost'} className={`w-full justify-start font-bold ${location.pathname === '/settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}>
              <Settings className="w-4 h-4 mr-3" />
              Settings
            </Button>
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto ml-64">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
