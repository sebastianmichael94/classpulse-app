import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './apiClient';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });
  const [message, setMessage] = useState({ text: '', isError: false });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ text: '', isError: false });
    
    // Set up urls mapping directly to our Django backend pipes
    const baseUrl = `${API_BASE_URL}/api/auth/`;
    const endpoint = isLogin ? 'login/' : 'register/';
    
    // Format payload to match our backend serializers expect fields
    const payload = isLogin 
      ? { username: formData.username, password: formData.password }
      : { 
          username: formData.username, 
          email: formData.email, 
          password: formData.password,
          first_name: formData.firstName,
          last_name: formData.lastName
        };

    try {
      const response = await axios.post(`${baseUrl}${endpoint}`, payload);
      setMessage({ text: response.data.message || "Success!", isError: false });
      
      if (isLogin) {
        // Save the authenticated user profile details in the browser cache storage
        localStorage.setItem('user', JSON.stringify(response.data.user));
        alert("Logged in successfully! Ready for the dashboard next.");
      } else {
        // Auto switch to login view on successful user account registration
        setIsLogin(true);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || "An error occurred. Check credentials.";
      setMessage({ text: errorMsg, isError: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        
        {/* ClassPulse Header Branding Area */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-600">ClassPulse</h1>
          <p className="text-slate-500 mt-2 text-sm">Live class results in one place.</p>
        </div>

        {/* Dynamic Tab Switch UI Sliders */}
        <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
          <button 
            className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button 
            className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${!isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setIsLogin(false)}
          >
            Create Account
          </button>
        </div>

        {/* System Error Notification Toasts */}
        {message.text && (
          <div className={`p-3 rounded-lg mb-4 text-sm font-medium ${message.isError ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {message.text}
          </div>
        )}

        {/* Input Interactive Submissions Layout */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">First Name</label>
                <input type="text" name="firstName" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.firstName} onChange={handleInputChange} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Last Name</label>
                <input type="text" name="lastName" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.lastName} onChange={handleInputChange} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Username</label>
            <input type="text" name="username" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.username} onChange={handleInputChange} />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Email Address</label>
              <input type="email" name="email" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.email} onChange={handleInputChange} />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Password</label>
            <input type="password" name="password" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.password} onChange={handleInputChange} />
          </div>

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-md transition-colors duration-200 mt-6">
            {isLogin ? 'Sign In' : 'Register Account'}
          </button>
        </form>

      </div>
    </div>
  );
}