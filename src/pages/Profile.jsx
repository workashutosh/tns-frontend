import React from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, MapPin, CreditCard, LogOut, Settings, Home, FileText, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Settings, label: 'Tools' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  const handleTabClick = (tabId) => {
    switch(tabId) {
      case 'home':
        navigate('/dashboard');
        break;
      case 'orders':
        navigate('/orders');
        break;
      case 'portfolio':
        navigate('/portfolio');
        break;
      case 'tools':
        navigate('/tools');
        break;
      case 'profile':
        // Already on profile page
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold text-white">Profile</h1>
        </div>
      </div>

      {/* Scrollable Profile Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
        {/* User Info Card */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <div className="flex items-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mr-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{user?.ClientName}</h2>
              <p className="text-gray-400">User ID: {user?.UserId}</p>
            </div>
          </div>

          {/* Profile Details */}
          <div className="space-y-4">
            <div className="flex items-center">
              <Mail className="w-5 h-5 text-gray-500 mr-3" />
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-white">{user?.EmailId || 'Not provided'}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Phone className="w-5 h-5 text-gray-500 mr-3" />
              <div>
                <p className="text-sm text-gray-400">Mobile</p>
                <p className="text-white">{user?.MobileNo || 'Not provided'}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <CreditCard className="w-5 h-5 text-gray-500 mr-3" />
              <div>
                <p className="text-sm text-gray-400">Reference ID</p>
                <p className="text-white">{user?.Refid}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Trading Permissions */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Trading Permissions</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">MCX Trading</span>
              <span className={`px-2 py-1 rounded-full text-sm ${
                user?.IsMCXTrade === 'true' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
              }`}>
                {user?.IsMCXTrade === 'true' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300">NSE Trading</span>
              <span className={`px-2 py-1 rounded-full text-sm ${
                user?.IsNSETrade === 'true' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
              }`}>
                {user?.IsNSETrade === 'true' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300">CDS Trading</span>
              <span className={`px-2 py-1 rounded-full text-sm ${
                user?.IsCDSTrade === 'true' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
              }`}>
                {user?.IsCDSTrade === 'true' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Account Summary */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Account Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-1">Ledger Balance</p>
              <p className="text-lg font-semibold text-white">
                ₹{parseFloat(user?.LedgerBalance || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Credit Limit</p>
              <p className="text-lg font-semibold text-white">
                ₹{parseFloat(user?.CreditLimit || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Active Trades</p>
              <p className="text-lg font-semibold text-white">{user?.TotalActive || '0'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Pending Orders</p>
              <p className="text-lg font-semibold text-white">{user?.TotalPending || '0'}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center hover:bg-gray-750 transition-colors">
            <Settings className="w-5 h-5 text-gray-400 mr-3" />
            <span className="text-white">Settings</span>
          </button>
          
          <button 
            onClick={handleLogout}
            className="w-full bg-red-900 border border-red-700 rounded-lg p-4 flex items-center hover:bg-red-800 transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-400 mr-3" />
            <span className="text-red-400">Logout</span>
          </button>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-1 py-2">
        <div className="flex justify-around items-center">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className="flex flex-col items-center py-2"
            >
              <item.icon 
                className={`w-6 h-6 mb-1 ${
                  item.id === 'profile' ? 'text-blue-500' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                item.id === 'profile' ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Profile;
