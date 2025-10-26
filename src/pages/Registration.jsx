import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';

const Registration = () => {
  const [currentStep, setCurrentStep] = useState(1); // 1: Mobile, 2: OTP, 3: Registration Form
  const [formData, setFormData] = useState({
    mobile: '',
    otp: '',
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    aadhar: '',
    panNo: '',
    city: '',
    address: ''
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Validation functions
  const validateMobile = (mobile) => {
    const regex = /^(?:[6789]\d{9})$/;
    return regex.test(mobile);
  };

  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validateAadhar = (aadhaar) => {
    const regex = /^\d{12}$/;
    return regex.test(aadhaar);
  };

  const validatePAN = (pan) => {
    const regex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return regex.test(pan.toUpperCase());
  };

  const validateName = (name) => {
    const regex = /^[A-Za-z\s-'.]+$/;
    return regex.test(name) && name.trim() !== "";
  };

  // Send OTP
  const sendOTP = async () => {
    if (!validateMobile(formData.mobile)) {
      toast.error('Please enter a valid Indian mobile number.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=C-769541B7B67C491&flowType=SMS&mobileNumber=' + formData.mobile, {
        method: 'POST',
        headers: {
          "authToken": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJDLTc2OTU0MUI3QjY3QzQ5MSIsImlhdCI6MTc1MTUyODcxMiwiZXhwIjoxOTA5MjA4NzEyfQ.XFKN0L0h2hHkHvQNDibseOXhsI934FQyo2IKDKomg9TFOqwMOFccJLKOjwyBs4c0bOC_xBmxFNAyew5mSqmq9Q"
        }
      });

      const result = await response.json();
      if (result.responseCode === 200 && result.message === "SUCCESS") {
        localStorage.setItem("trnID", result.data.verificationId);
        toast.success('OTP Sent Successfully.');
        setCurrentStep(2);
      } else {
        toast.error('Failed to send OTP.');
      }
    } catch (error) {
      console.error('OTP Error:', error);
      toast.error('Server error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const verifyOTP = async () => {
    const otpCode = formData.otp;
    const verificationId = localStorage.getItem("trnID");

    if (!otpCode || !verificationId) {
      toast.error('Missing OTP or Verification ID.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${formData.mobile}&verificationId=${verificationId}&customerId=C-769541B7B67C491&code=${otpCode}`, {
        method: 'GET',
        headers: {
          "authToken": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJDLTc2OTU0MUI3QjY3QzQ5MSIsImlhdCI6MTc1MTUyODcxMiwiZXhwIjoxOTA5MjA4NzEyfQ.XFKN0L0h2hHkHvQNDibseOXhsI934FQyo2IKDKomg9TFOqwMOFccJLKOjwyBs4c0bOC_xBmxFNAyew5mSqmq9Q"
        }
      });

      const result = await response.json();
      if (result.responseCode === 200 && result.data.verificationStatus === "VERIFICATION_COMPLETED") {
        toast.success('OTP verified successfully!');
        setCurrentStep(3);
      } else {
        toast.error('OTP verification failed.');
      }
    } catch (error) {
      console.error('OTP Verification Error:', error);
      toast.error('OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // Check username availability
  const checkUsername = async (username) => {
    if (!username) return;
    
    try {
      const prefix = localStorage.getItem("prefix") || "";
      const response = await authAPI.getUserCount(prefix + username);
      if (response !== "0") {
        toast.error('Username already exists');
        setFormData(prev => ({ ...prev, username: '' }));
      }
    } catch (error) {
      console.error('Username check error:', error);
    }
  };

  // Submit registration
  const submitRegistration = async () => {
    // Validate all fields
    if (!validateEmail(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!validateAadhar(formData.aadhar)) {
      toast.error('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    if (!validatePAN(formData.panNo)) {
      toast.error('Please enter a valid PAN number');
      return;
    }
    if (!validateName(formData.firstName)) {
      toast.error('Please enter a valid first name');
      return;
    }
    if (!validateName(formData.lastName)) {
      toast.error('Please enter a valid last name');
      return;
    }

    setLoading(true);
    try {
      const registrationData = {
        txtfirstname: formData.firstName,
        txtlastname: formData.lastName,
        txtmob: formData.mobile,
        txtemail: formData.email,
        txtusernm: formData.username,
        txtaadhar: formData.aadhar,
        txtupassword: formData.password,
        txtpanno: formData.panNo.toUpperCase(),
        txtcity: formData.city,
        txtaddress: formData.address,
        txtdomainname: localStorage.getItem("prefix") || ""
      };

      const response = await authAPI.register(registrationData);
      if (response === "true") {
        toast.success('User Details Successfully Submitted. Thank you for connecting with us! We will contact you soon.');
        navigate('/login');
      } else {
        toast.error(response || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration Error:', error);
      toast.error('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-trading-primary-600 rounded-lg flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-xl">T</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign up</h1>
        <p className="text-gray-600">Let's get your account set up</p>
      </div>

      <div>
        <input
          type="number"
          name="mobile"
          value={formData.mobile}
          onChange={handleInputChange}
          className="input-trading"
          placeholder="Enter Mobile Number"
          maxLength="10"
          required
        />
      </div>

      <button
        onClick={sendOTP}
        disabled={loading}
        className="w-full btn-trading disabled:opacity-50"
      >
        {loading ? 'Sending OTP...' : 'Send OTP'}
      </button>

      <button
        onClick={() => navigate('/welcome')}
        className="w-full btn-secondary"
      >
        Go Back To Login
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify OTP</h1>
        <p className="text-gray-600">Enter the OTP sent to {formData.mobile}</p>
      </div>

      <div>
        <input
          type="text"
          name="otp"
          value={formData.otp}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter OTP"
          required
        />
      </div>

      <button
        onClick={verifyOTP}
        disabled={loading}
        className="w-full btn-trading disabled:opacity-50"
      >
        {loading ? 'Verifying OTP...' : 'Verify & Continue'}
      </button>

      <button
        onClick={() => setCurrentStep(1)}
        className="w-full btn-secondary"
      >
        Send OTP Again
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Complete Registration</h1>
        <p className="text-gray-600">Fill in your details to complete the registration</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          name="firstName"
          value={formData.firstName}
          onChange={handleInputChange}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="First Name"
          required
        />
        <input
          type="text"
          name="lastName"
          value={formData.lastName}
          onChange={handleInputChange}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Last Name"
          required
        />
      </div>

      <input
        type="text"
        name="mobile"
        value={formData.mobile}
        readOnly
        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
        placeholder="Mobile Number"
      />

      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleInputChange}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Email Address"
        required
      />

      <input
        type="text"
        name="username"
        value={formData.username}
        onChange={handleInputChange}
        onBlur={(e) => checkUsername(e.target.value)}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Username"
        maxLength="10"
        required
      />

      <input
        type="password"
        name="password"
        value={formData.password}
        onChange={handleInputChange}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Password"
        required
      />

      <input
        type="text"
        name="aadhar"
        value={formData.aadhar}
        onChange={handleInputChange}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Aadhar Number"
        maxLength="12"
        required
      />

      <input
        type="text"
        name="panNo"
        value={formData.panNo}
        onChange={handleInputChange}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
        placeholder="PAN Number"
        maxLength="10"
        style={{ textTransform: 'uppercase' }}
        required
      />

      <input
        type="text"
        name="city"
        value={formData.city}
        onChange={handleInputChange}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="City"
        required
      />

      <input
        type="text"
        name="address"
        value={formData.address}
        onChange={handleInputChange}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Address"
        required
      />

      <button
        onClick={submitRegistration}
        disabled={loading}
        className="w-full btn-trading disabled:opacity-50"
      >
        {loading ? 'Saving User...' : 'Submit'}
      </button>

      <button
        onClick={() => navigate('/welcome')}
        className="w-full btn-secondary"
      >
        Go Back To Login
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="p-6">
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center text-trading-neutral-600 hover:text-trading-neutral-900 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </div>
    </div>
  );
};

export default Registration;
