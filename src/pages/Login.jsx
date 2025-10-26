import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, EyeOff, Lock, User, Server } from 'lucide-react';
import { authAPI } from '../services/api';
import { generateDeviceId, getDeviceIP } from '../utils/deviceUtils';
import { useAuth } from '../hooks/useAuth.jsx';
import logo from '../assets/logo.svg';


const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    serverCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    
    try {
      const deviceId = generateDeviceId();
      const deviceIp = await getDeviceIP();
      const masterRefId = localStorage.getItem('masteruserid') || 'null';
      
      const response = await authAPI.login(
        formData.username,
        formData.password,
        deviceId,
        formData.serverCode || 'undefined',
        masterRefId
      );

      if (response && response.UserId) {
        // Store all user data as per original logic
        const userData = {
          ...response,
          deviceId,
          deviceIp,
          oldpassword: formData.password
        };
        
        // Store individual items in localStorage as per original logic
        localStorage.setItem("userid", response.UserId);
        localStorage.setItem("ClientName", response.ClientName);
        localStorage.setItem("oldpassword", formData.password);
        localStorage.setItem("Refid", response.Refid);
        localStorage.setItem("isonlinepayment", response.isonlinepayment);
        localStorage.setItem("MobileNo", response.MobileNo);
        localStorage.setItem("EmailId", response.EmailId);
        localStorage.setItem("IsMCXTrade", response.IsMCXTrade);
        localStorage.setItem("IsNSETrade", response.IsNSETrade);
        localStorage.setItem("IsCDSTrade", response.IsCDSTrade);
        localStorage.setItem("CreditLimit", response.CreditLimit);
        localStorage.setItem("LedgerBalance", response.LedgerBalance);
        localStorage.setItem("TotalActive", response.TotalActive);
        localStorage.setItem("TotalPending", response.TotalPending);
        localStorage.setItem("TotalClosed", response.TotalClosed);
        
        login(userData);
        toast.success(`Welcome back, ${response.ClientName}!`);
        navigate('/dashboard');
      } else if (response === 'false') {
        toast.error('Invalid Login Details. Please Try Again.');
      } else if (response === 'Bloked') {
        toast.error('Sorry Your Account Is Blocked');
      } else {
        toast.error('Login failed. Please check your credentials and try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="p-6">
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src={logo} alt="TradeNstocko Logo" className="w-20 h-20 rounded-lg object-contain mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Login to Tradenstocko</h1>
            <p className="text-gray-600">Enter your credentials to access your account</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="input-trading pl-10"
                placeholder="Username"
                required
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="input-trading pl-10 pr-10"
                placeholder="Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Server Code Field (Optional) */}
            {/* <div className="relative">
              <Server className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="serverCode"
                name="serverCode"
                value={formData.serverCode}
                onChange={handleInputChange}
                className="input-trading pl-10"
                placeholder="Server Code (Optional)"
              />
            </div> */}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-trading disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </div>
              ) : (
                'Login to TradeNstocko' 
              )}
            </button>
          </form>

          {/* Demo Credentials */}
          {/* <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Demo Credentials:</h3>
            <p className="text-xs text-blue-700">
              Username: <span className="font-mono bg-blue-100 px-1 rounded">Testlogin</span>
            </p>
            <p className="text-xs text-blue-700">
              Password: <span className="font-mono bg-blue-100 px-1 rounded">54321</span>
            </p>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default Login;
