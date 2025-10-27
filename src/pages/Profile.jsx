import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { 
  Home, FileText, Briefcase, Settings, User, Eye, EyeOff, X, 
  Bell, Mail, Phone, MapPin, CreditCard, FileSearch, DollarSign,
  Activity, TrendingUp, TrendingDown
} from 'lucide-react';
import { tradingAPI, authAPI } from '../services/api';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // Modal states
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [showPersonalDetailsModal, setShowPersonalDetailsModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPayOnlineModal, setShowPayOnlineModal] = useState(false);
  const [showFundDetailsModal, setShowFundDetailsModal] = useState(false);
  const [showInvoiceBillModal, setShowInvoiceBillModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showKYCModal, setShowKYCModal] = useState(false);
  
  // Form states
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({ old: false, new: false, confirm: false });
  const [withdrawData, setWithdrawData] = useState({ amount: '', remark: '' });
  const [complaintData, setComplaintData] = useState({ name: '', callno: '', whatsappno: '', message: '' });
  
  // Data states
  const [balanceData, setBalanceData] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0
  });
  const [activeOrders, setActiveOrders] = useState([]);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [billInfo, setBillInfo] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [personalDetails, setPersonalDetails] = useState(null);
  const [kycData, setKycData] = useState(null);
  const [kycImages, setKycImages] = useState({ aadhaar: null, pan: null });
  const [uploadMessage, setUploadMessage] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  
  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Settings, label: 'Tools' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  useEffect(() => {
    if (user?.UserId) {
      loadProfileData();
    }
  }, [user]);

  const loadProfileData = async () => {
    try {
      // Use Promise.allSettled to prevent one failure from breaking all
      await Promise.allSettled([
        getUserBalance(),
        getActiveOrders(),
        getTransactionHistory(),
        getBillInfo(),
        getNotifications(),
        getProfileData(),
        getPersonalDetails()
      ]);
    } catch (error) {
      console.error('Error loading profile data:', error);
      // Don't show error toast - let individual functions handle their own errors
    }
  };

  const getUserBalance = async () => {
    try {
      if (!user?.UserId) return;
      const balance = await tradingAPI.getLedgerBalance(user.UserId);
      setBalanceData(prev => ({ ...prev, ledgerBalance: parseFloat(balance || 0) }));
    } catch (error) {
      console.error('Error getting balance:', error);
      // Set default value on error
      setBalanceData(prev => ({ ...prev, ledgerBalance: 0 }));
    }
  };

  const getActiveOrders = async () => {
    try {
      if (!user?.UserId) return;
      const orders = await tradingAPI.getConsolidatedTrades(user.UserId);
      setActiveOrders(Array.isArray(orders) ? orders : []);
    } catch (error) {
      console.error('Error getting active orders:', error);
      setActiveOrders([]);
    }
  };

  const getTransactionHistory = async () => {
    try {
      if (!user?.UserId) return;
      const transactions = await tradingAPI.getUserBalanceLedger(user.UserId);
      setTransactionHistory(Array.isArray(transactions) ? transactions : []);
    } catch (error) {
      console.error('Error getting transactions:', error);
      setTransactionHistory([]);
    }
  };

  const getBillInfo = async () => {
    try {
      if (!user?.UserId) return;
      const bills = await tradingAPI.getUserBill(user.UserId);
      setBillInfo(Array.isArray(bills) ? bills : []);
    } catch (error) {
      console.error('Error getting bill info:', error);
      setBillInfo([]);
    }
  };

  const getNotifications = async () => {
    try {
      if (!user?.UserId || !user?.Refid) return;
      const notifs = await tradingAPI.getNotification(user.UserId, user.Refid);
      setNotifications(Array.isArray(notifs) ? notifs : []);
    } catch (error) {
      console.error('Error getting notifications:', error);
      setNotifications([]);
    }
  };

  const getProfileData = async () => {
    try {
      if (!user?.UserId) return;
      const profile = await tradingAPI.getProfileData(user.UserId);
      setProfileData(profile);
    } catch (error) {
      console.error('Error getting profile data:', error);
      setProfileData(null);
    }
  };

  const getPersonalDetails = async () => {
    try {
      if (!user?.UserId) return;
      const details = await authAPI.getUserProfile(user.UserId);
      if (Array.isArray(details) && details.length > 0) {
        setPersonalDetails(details[0]);
      }
    } catch (error) {
      console.error('Error getting personal details:', error);
      setPersonalDetails(null);
    }
  };

  const handleTabClick = (tabId) => {
    switch(tabId) {
      case 'home': navigate('/dashboard'); break;
      case 'orders': navigate('/orders'); break;
      case 'portfolio': navigate('/portfolio'); break;
      case 'tools': navigate('/tools'); break;
      default: break;
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.old || !passwords.new || !passwords.confirm) {
      toast.error('Please fill all fields');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    
    try {
      // Note: We need to add changePassword to authAPI
      const response = await fetch(
        `/api/changepassword/?userid=${user.UserId}&oldpass=${encodeURIComponent(passwords.old)}&newpass=${encodeURIComponent(passwords.new)}`
      ).then(r => r.text());
      
      if (response === 'true') {
        toast.success('Password changed successfully');
        setShowChangePasswordModal(false);
        setPasswords({ old: '', new: '', confirm: '' });
      } else {
        toast.error('Incorrect current password');
      }
    } catch (error) {
      toast.error('Failed to change password');
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawData.amount || !withdrawData.remark) {
      toast.error('Please fill all fields');
      return;
    }
    
    try {
      await tradingAPI.saveTransaction({
        userid: user.UserId,
        txttransid: 'Withdraw',
        txttransamount: withdrawData.amount,
        txttransremark: withdrawData.remark,
        refid: user.Refid
      });
      
      toast.success('Withdrawal request submitted');
      setShowWithdrawModal(false);
      setWithdrawData({ amount: '', remark: '' });
      getUserBalance();
    } catch (error) {
      toast.error('Failed to submit withdrawal');
    }
  };

  const fetchKYCStatus = async () => {
    try {
      if (!user?.UserId) return;
      
      setKycLoading(true);
      const response = await fetch(`https://tnsadmin.twmresearchalert.com/api/get_kyc.php?user_id=${user.UserId}`);
      const data = await response.json();
      
      if (data.status === 'success' && data.data && data.data.length > 0 && data.data[0].aadhaar_image && data.data[0].pan_image) {
        setKycData(data.data[0]);
      } else {
        setKycData(null);
      }
    } catch (error) {
      console.error('Error fetching KYC status:', error);
      setKycData(null);
    } finally {
      setKycLoading(false);
    }
  };

  const handleKYCUpload = async (aadhaarFile, panFile) => {
    try {
      if (!aadhaarFile || !panFile) {
        setUploadMessage('Both files are required');
        return;
      }
      
      if (aadhaarFile.size > 2 * 1024 * 1024 || panFile.size > 2 * 1024 * 1024) {
        setUploadMessage('Each file must be less than 2MB');
        return;
      }
      
      if (!aadhaarFile.type.startsWith('image/') || !panFile.type.startsWith('image/')) {
        setUploadMessage('Only image files are allowed');
        return;
      }
      
      const formData = new FormData();
      formData.append('aadhaar_image', aadhaarFile);
      formData.append('pan_image', panFile);
      formData.append('user_id', user.UserId);
      
      setUploadMessage('Uploading...');
      
      const response = await fetch('https://tnsadmin.twmresearchalert.com/api/submit_kyc.php', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        setUploadMessage('KYC images submitted successfully!');
        toast.success('KYC submitted successfully!');
        setTimeout(async () => {
          await fetchKYCStatus();
          setUploadMessage('');
        }, 1500);
      } else {
        setUploadMessage(result.message || 'Submission failed. Please try again.');
      }
    } catch (error) {
      console.error('Error uploading KYC:', error);
      setUploadMessage('Submission failed. Please try again.');
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-20">
      {/* Top Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-semibold text-white">{user?.ClientName || 'User'}</h1>
          <Bell className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-3">
        {/* User Info Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-white font-bold text-base mb-1">{user?.UserId || user?.Refid || 'User ID'}</div>
              <div className="text-gray-400 text-xs">{user?.EmailId || 'Email'}</div>
            </div>
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {user?.ClientName ? user.ClientName.substring(0, 2).toUpperCase() : 'U'}
              </span>
            </div>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          <div className="bg-gray-800 rounded border border-gray-700 p-2">
            <div className="text-gray-400 text-[10px] mb-0.5">Ledger</div>
            <div className="text-xs font-medium text-white">₹{(balanceData.ledgerBalance || 0).toFixed(0)}</div>
          </div>
          <div className="bg-gray-800 rounded border border-gray-700 p-2">
            <div className="text-gray-400 text-[10px] mb-0.5">Margin</div>
            <div className="text-xs font-medium text-white">₹{(balanceData.marginAvailable || 0).toFixed(0)}</div>
          </div>
          <div className="bg-gray-800 rounded border border-gray-700 p-2">
            <div className="text-gray-400 text-[10px] mb-0.5">P/L</div>
            <div className={`text-xs font-medium ${(balanceData.activePL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{(balanceData.activePL || 0).toFixed(0)}
            </div>
          </div>
          <div className="bg-gray-800 rounded border border-gray-700 p-2">
            <div className="text-gray-400 text-[10px] mb-0.5">M2M</div>
            <div className="text-xs font-medium text-white">₹{(balanceData.m2m || 0).toFixed(0)}</div>
          </div>
        </div>

        {/* Account Menu */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 mb-4">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-white text-base font-semibold">Account</h2>
          </div>
          <div className="divide-y divide-gray-700">
            <MenuItem icon={<Activity className="w-5 h-5" />} label="Intraday History" onClick={() => toast.info('Coming soon')} />
            <MenuItem icon={<User className="w-5 h-5" />} label="KYC" onClick={() => { setShowKYCModal(true); fetchKYCStatus(); }} />
            <MenuItem icon={<DollarSign className="w-5 h-5" />} label="Funds" onClick={() => setShowFundDetailsModal(true)} />
            <MenuItem icon={<FileText className="w-5 h-5" />} label="Bill & Invoice" onClick={() => setShowInvoiceBillModal(true)} />
            <MenuItem icon={<User className="w-5 h-5" />} label="User Trade Profile" onClick={() => setShowUserProfileModal(true)} />
            <MenuItem icon={<User className="w-5 h-5" />} label="User Details" onClick={() => setShowPersonalDetailsModal(true)} />
            <MenuItem icon={<Bell className="w-5 h-5" />} label="Notifications" onClick={() => setShowNotificationModal(true)} />
            <MenuItem icon={<Settings className="w-5 h-5" />} label="Change Password" onClick={() => setShowChangePasswordModal(true)} />
            <MenuItem icon={<CreditCard className="w-5 h-5" />} label="Deposit Online" onClick={() => toast.info('Coming soon')} />
            <MenuItem icon={<CreditCard className="w-5 h-5" />} label="Withdraw Online" onClick={() => setShowWithdrawModal(true)} />
            <MenuItem icon={<Settings className="w-5 h-5" />} label="Logout" onClick={handleLogout} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-2 py-2">
        <div className="flex justify-around items-center max-w-md mx-auto">
          {bottomNavItems.map((item) => (
            <button key={item.id} onClick={() => handleTabClick(item.id)} className="flex flex-col items-center py-2 px-3">
              <item.icon className={`w-6 h-6 mb-1 ${item.id === 'profile' ? 'text-blue-500' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium ${item.id === 'profile' ? 'text-blue-500' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      <Modal show={showChangePasswordModal} onClose={() => setShowChangePasswordModal(false)} title="Change Password">
        <div className="space-y-4">
          <PasswordInput label="Current Password" value={passwords.old} onChange={(v) => setPasswords({...passwords, old: v})} show={showPasswords.old} toggleShow={() => setShowPasswords({...showPasswords, old: !showPasswords.old})} />
          <PasswordInput label="New Password" value={passwords.new} onChange={(v) => setPasswords({...passwords, new: v})} show={showPasswords.new} toggleShow={() => setShowPasswords({...showPasswords, new: !showPasswords.new})} />
          <PasswordInput label="Confirm New Password" value={passwords.confirm} onChange={(v) => setPasswords({...passwords, confirm: v})} show={showPasswords.confirm} toggleShow={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleChangePassword} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm font-medium">Change Password</button>
            <button onClick={() => setShowChangePasswordModal(false)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded text-sm font-medium">Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal show={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} title="Withdraw Online">
        <div className="space-y-4">
          <Input label="Enter Amount" type="number" value={withdrawData.amount} onChange={(v) => setWithdrawData({...withdrawData, amount: v})} />
          <Textarea label="Enter Remarks" value={withdrawData.remark} onChange={(v) => setWithdrawData({...withdrawData, remark: v})} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleWithdraw} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm font-medium">Submit</button>
            <button onClick={() => setShowWithdrawModal(false)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded text-sm font-medium">Close</button>
          </div>
        </div>
      </Modal>

      <Modal show={showFundDetailsModal} onClose={() => setShowFundDetailsModal(false)} title="Transaction History">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center p-2.5 bg-gray-900 rounded mb-2">
            <span className="text-sm font-medium text-gray-300">Current Balance</span>
            <span className="text-base font-semibold text-green-400">₹{(balanceData.ledgerBalance || 0).toFixed(0)}</span>
          </div>
          {transactionHistory && transactionHistory.length > 0 ? (
            transactionHistory.map((t, idx) => (
              <div key={idx} className="bg-gray-900 rounded p-2.5 border border-gray-700">
                <div className="flex justify-between items-center">
                  <div><div className="text-xs text-gray-400">{t.CreatedDate || '-'}</div></div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">{t.TransactionType || '-'}</div>
                    <div className={`text-sm font-medium ${t.TransactionType === 'Withdrawal' || t.TransactionType === 'Loss' ? 'text-red-400' : 'text-green-400'}`}>
                      {(t.TransactionType === 'Withdrawal' || t.TransactionType === 'Loss' ? '-' : '+')}₹{t.Amount || 0}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 p-3 text-sm">No transactions found</div>
          )}
        </div>
      </Modal>

      <Modal show={showNotificationModal} onClose={() => setShowNotificationModal(false)} title="Notifications">
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notifications && notifications.length > 0 ? (
            notifications.map((n, idx) => (
              <div key={idx} className="bg-gray-900 rounded p-2.5 border border-gray-700">
                <div className="text-sm font-medium text-gray-200 mb-0.5">{n.Title || 'No title'} ({n.CreatedDate || '-'})</div>
                <div className="text-gray-400 text-xs">{n.Message || 'No message'}</div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 p-3 text-sm">No notifications found</div>
          )}
        </div>
      </Modal>

      <Modal show={showPersonalDetailsModal} onClose={() => setShowPersonalDetailsModal(false)} title="User Details">
        {personalDetails && (
          <div className="space-y-3">
            <DetailRow label="User Name" value={personalDetails.UserName} />
            <DetailRow label="Name" value={`${personalDetails.FirstName} ${personalDetails.LastName}`} />
            <DetailRow label="Mobile No." value={personalDetails.MobileNo} />
            <DetailRow label="Email Id" value={personalDetails.EmailId} />
            <DetailRow label="Aadhar No" value={personalDetails.AadharNo === '0' || !personalDetails.AadharNo ? 'xxxx-xxxx-xxxx' : personalDetails.AadharNo} />
            <DetailRow label="PAN No" value={personalDetails.PanNo} />
            <DetailRow label="City" value={personalDetails.City} />
            <DetailRow label="Address" value={personalDetails.Address} />
          </div>
        )}
      </Modal>

      <Modal show={showInvoiceBillModal} onClose={() => setShowInvoiceBillModal(false)} title="Bill & Invoice" size="lg">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700"><th className="text-left py-1.5 px-2 text-gray-300">S.No</th><th className="text-left py-1.5 px-2 text-gray-300">Script</th><th className="text-center py-1.5 px-2 text-gray-300">Order Price</th><th className="text-center py-1.5 px-2 text-gray-300">Close Price</th><th className="text-right py-1.5 px-2 text-gray-300">P/L</th><th className="text-right py-1.5 px-2 text-gray-300">Brokerage</th></tr>
            </thead>
            <tbody className="text-gray-300">
              {billInfo && billInfo.length > 0 ? (
                billInfo.map((b, idx) => (
                  <tr key={idx} className="border-b border-gray-700">
                    <td className="py-1.5 px-2">{idx + 1}</td>
                    <td className="py-1.5 px-2"><div className="font-medium">{b.ScriptName || '-'}</div><div className="text-[10px] text-gray-400">{b.OrderCategory || '-'} ({b.Lot || 0})</div></td>
                    <td className="py-1.5 px-2 text-center"><div>{b.OrderPrice || '-'}</div><div className="text-[10px] text-gray-400">{b.OrderDate || ''} {b.OrderTime || ''}</div></td>
                    <td className="py-1.5 px-2 text-center"><div>{b.BroughtBy || '-'}</div><div className="text-[10px] text-gray-400">{b.ClosedAt || ''} {b.ClosedTime || ''}</div></td>
                    <td className="py-1.5 px-2 text-right">{b.P_L || 0}</td>
                    <td className="py-1.5 px-2 text-right">{b.Brokerage || 0}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="text-center py-3 text-gray-400 text-sm">No bill information found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal show={showUserProfileModal} onClose={() => setShowUserProfileModal(false)} title="User Trade Profile" size="lg">
        {profileData && (
          <div className="space-y-4">
            {profileData.MCX?.IsMCXTrade === 'true' && (
              <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                <h4 className="font-semibold mb-3">MCX</h4>
                <div className="grid grid-cols-2 gap-3 text-sm"><DetailRow label="Brokerage Type" value={profileData.MCX?.Mcx_Brokerage_Type} /></div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal show={showKYCModal} onClose={() => setShowKYCModal(false)} title="KYC Details" size="lg">
        <KYCContent 
          user={user} 
          kycData={kycData} 
          onUpload={handleKYCUpload}
          uploadMessage={uploadMessage}
          loading={kycLoading}
        />
      </Modal>
    </div>
  );
};

const Modal = ({ show, onClose, title, children, size = 'md' }) => {
  if (!show) return null;
  const sizeClass = size === 'lg' ? 'max-w-4xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-800 rounded shadow-xl ${sizeClass} max-h-[90vh] overflow-y-auto w-full`}>
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-2.5 flex justify-between items-center">
          <h3 className="text-base font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const MenuItem = ({ icon, label, badge, onClick }) => (
  <button onClick={onClick} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750 transition-colors">
    <div className="flex items-center">
      <div className="text-gray-400 mr-3">{icon}</div>
      <span className="text-white text-sm">{label}</span>
    </div>
    {badge && <span className="text-xs px-2 py-0.5 bg-orange-600 text-white rounded">{badge}</span>}
  </button>
);

const Input = ({ label, type = 'text', value, onChange }) => (
  <div className="mb-3"><label className="block text-xs text-gray-400 mb-1">{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500" /></div>
);

const Textarea = ({ label, value, onChange }) => (
  <div className="mb-3"><label className="block text-xs text-gray-400 mb-1">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} rows="3" className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500" /></div>
);

const PasswordInput = ({ label, value, onChange, show, toggleShow }) => (
  <div className="mb-3"><label className="block text-xs text-gray-400 mb-1">{label}</label><div className="relative"><input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500" /><button type="button" onClick={toggleShow} className="absolute right-2 top-2 text-gray-400">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
);

const DetailRow = ({ label, value }) => (
  <div className="mb-2"><div className="text-gray-400 text-xs mb-0.5">{label}</div><div className="text-gray-100 text-sm">{value || '-'}</div></div>
);

const KYCContent = ({ user, kycData, onUpload, uploadMessage, loading }) => {
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [panFile, setPanFile] = useState(null);

  const handleFileChange = (type, file) => {
    if (file) {
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSize) {
        toast.error('File size must be less than 2MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed');
        return;
      }
    }
    
    if (type === 'aadhaar') {
      setAadhaarFile(file);
    } else {
      setPanFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (aadhaarFile && panFile) {
      onUpload(aadhaarFile, panFile);
      setAadhaarFile(null);
      setPanFile(null);
    } else {
      toast.error('Both files are required');
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="text-center p-8 text-gray-400">Loading KYC status...</div>
    );
  }

  // If KYC is already submitted, show the images and status
  if (kycData && kycData.aadhaar_image && kycData.pan_image) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-2">Aadhaar Image</div>
            <img 
              src={`data:image/png;base64,${kycData.aadhaar_image}`} 
              alt="Aadhaar" 
              className="max-w-full max-h-48 mx-auto rounded border border-gray-700"
            />
          </div>
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-2">PAN Image</div>
            <img 
              src={`data:image/png;base64,${kycData.pan_image}`} 
              alt="PAN" 
              className="max-w-full max-h-48 mx-auto rounded border border-gray-700"
            />
          </div>
          <div className="mt-6">
            <div className="text-sm text-gray-400 mb-1">Approval Status</div>
            <div className={`text-base font-semibold ${
              kycData.approval_status === 'approved' ? 'text-green-400' : 
              kycData.approval_status === 'pending' ? 'text-orange-400' : 'text-red-400'
            }`}>
              {kycData.approval_status.charAt(0).toUpperCase() + kycData.approval_status.slice(1)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If KYC not submitted, show upload form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-2">Aadhaar Image (max 2MB, images only)</label>
        <input 
          type="file" 
          accept="image/*"
          onChange={(e) => handleFileChange('aadhaar', e.target.files[0])}
          className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-2">PAN Image (max 2MB, images only)</label>
        <input 
          type="file" 
          accept="image/*"
          onChange={(e) => handleFileChange('pan', e.target.files[0])}
          className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-blue-500"
        />
      </div>
      {uploadMessage && (
        <div className={`text-sm p-2 rounded ${
          uploadMessage.includes('success') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
        }`}>
          {uploadMessage}
        </div>
      )}
      <button 
        type="submit" 
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm font-medium"
      >
        Submit KYC
      </button>
    </form>
  );
};

export default Profile;
