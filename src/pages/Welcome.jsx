import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import logo from '../assets/logo.svg';



const Welcome = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/login');
  };

  const handleRegister = () => {
    navigate('/registration');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="p-6">
        <img src={logo} alt="TradeNstocko Logo" className="w-10 h-10 rounded-lg object-contain" />
      </div>

      {/* Main Content */}
      <div className="px-6 pb-6">
        {/* Welcome Text */}
        <div className="mb-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to
          </h1>
          <h2 className="text-3xl font-bold text-blue-600 mb-8">
            Tradenstocko
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 mb-12">
          {/* Login Button */}
          <button
            onClick={handleLogin}
            className="w-full bg-white border-2 border-gray-200 hover:border-blue-500 text-gray-900 font-semibold py-4 px-6 rounded-lg transition-all duration-200 flex items-center justify-between group"
          >
            <div className="flex items-center">
              <LogIn className="w-5 h-5 mr-3 text-gray-600 group-hover:text-blue-500 transition-colors" />
              <span>Login to Tradenstocko</span>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Register Button */}
          <button
            onClick={handleRegister}
            className="w-full bg-white border-2 border-gray-200 hover:border-blue-500 text-gray-900 font-semibold py-4 px-6 rounded-lg transition-all duration-200 flex items-center justify-between group"
          >
            <div className="flex items-center">
              <UserPlus className="w-5 h-5 mr-3 text-gray-600 group-hover:text-blue-500 transition-colors" />
              <span>Open a new account</span>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </button>
        </div>

        {/* Regulatory Information */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">TRADENSTOCKO</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>Member: BSE, NSE & MCX</p>
            <p>SEBI Registration No: INZ000031633</p>
            <p>CDSL Depository Participant ID: 12086000</p>
            <p>NSDL Depository Participant ID: IN300648</p>
            <p>Address: 123 Trading Street, Mumbai, Maharashtra 400001</p>
            <p>Phone: +91-22-1234-5678</p>
            <p>Email: support@tradenstocko.com</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
