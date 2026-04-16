import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Video, Settings, LogOut } from 'lucide-react';

export function Layout() {
  const { logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Video className="w-6 h-6 text-blue-600" />
            ZoomSync
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <Link to="/">
            <Button variant={location.pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Video className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant={location.pathname === '/settings' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Settings className="w-4 h-4 mr-2" />
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
      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
