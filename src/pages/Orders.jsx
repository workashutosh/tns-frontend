import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, TrendingDown, Home, Briefcase, Settings, User } from 'lucide-react';
import { tradingAPI } from '../services/api';
import toast from 'react-hot-toast';

const Orders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  const tabs = [
    { id: 'pending', label: 'Pending' },
    { id: 'active', label: 'Active' },
    { id: 'closed', label: 'Closed' },
    { id: 'sltp', label: 'SL/TP' }
  ];

  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Settings, label: 'Tools' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  useEffect(() => {
    if (user?.UserId) {
      fetchOrders();
    }
  }, [user]);

  useEffect(() => {
    if (user?.UserId && activeTab) {
      fetchOrdersByStatus();
    }
  }, [activeTab, user?.UserId]);

  const fetchOrdersByStatus = async () => {
    setLoading(true);
    try {
      let response;
      
      if (activeTab === 'sltp') {
        // Get SL/TP orders
        response = await tradingAPI.getSLTP(user.UserId);
      } else {
        // Get orders by status (Pending, Active, or Closed)
        response = await tradingAPI.getOrders(activeTab.charAt(0).toUpperCase() + activeTab.slice(1), user.UserId);
      }
      
      // Parse response if it's a string
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      setOrders(data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    // This is called on initial load - fetch active orders by default
    setActiveTab('active');
  };

  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <FileText className="w-4 h-4 text-blue-500" />;
    }
  };

  const getActionIcon = (action) => {
    return action.toLowerCase() === 'buy' ? 
      <TrendingUp className="w-4 h-4 text-green-500" /> : 
      <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
  };

  const handleNavClick = (navId) => {
    switch(navId) {
      case 'home':
        navigate('/dashboard');
        break;
      case 'orders':
        // Already on orders page
        break;
      case 'portfolio':
        navigate('/portfolio');
        break;
      case 'tools':
        navigate('/tools');
        break;
      case 'profile':
        navigate('/profile');
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="px-2 py-2">
          <h1 className="text-md font-bold text-white">Orders</h1>
        </div>
      </div>

      {/* Fixed Tabs */}
      <div className="flex-shrink-0 flex bg-gray-800 border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-750'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable Orders List */}
      <div className="flex-1 overflow-y-auto px-2 py-4 pb-24">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order, index) => {
              // Handle SL/TP orders differently
              if (activeTab === 'sltp') {
                const scriptParts = order.ScriptName?.split('_') || [order.ScriptName, ''];
                return (
                  <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <div>
                          <h3 className="font-semibold text-white">{scriptParts[0]}</h3>
                          <p className="text-sm text-gray-400">{scriptParts[1]}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium px-2 py-1 rounded-full bg-green-900 text-green-300">
                          {order.OrderCategory}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Stop Loss</p>
                        <p className="font-medium text-red-400">₹{order.SL}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Take Profit</p>
                        <p className="font-medium text-green-400">₹{order.TP}</p>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">{order.DateTime}</span>
                        <span className="text-green-400 px-2 py-1 rounded bg-green-900">
                          {order.Status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Regular orders display
              const scriptParts = order.ScriptName?.split('_') || [order.ScriptName, ''];
              return (
                <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-2">
                      {getActionIcon(order.OrderCategory)}
                      <div>
                        <h3 className="font-semibold text-white">{scriptParts[0]}</h3>
                        <p className="text-sm text-gray-400">{scriptParts[1] || order.ActionType}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.OrderStatus)}
                      <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                        order.OrderStatus?.toLowerCase() === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                        order.OrderStatus?.toLowerCase() === 'active' ? 'bg-green-900 text-green-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {order.OrderStatus}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Order Type</p>
                      <p className="font-medium text-white">{order.OrderType}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Lot Size</p>
                      <p className="font-medium text-white">{order.Lot}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Price</p>
                      <p className="font-medium text-white">₹{order.OrderPrice}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Margin Used</p>
                      <p className="font-medium text-white">₹{order.MarginUsed}</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">
                        {order.OrderDate} at {order.OrderTime}
                      </span>
                      <span className="text-gray-400">Order ID: {order.Id}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No orders found</p>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-1 py-2">
        <div className="flex justify-around items-center">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className="flex flex-col items-center py-2"
            >
              <item.icon 
                className={`w-6 h-6 mb-1 ${
                  item.id === 'orders' ? 'text-blue-500' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                item.id === 'orders' ? 'text-blue-500' : 'text-gray-400'
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

export default Orders;
