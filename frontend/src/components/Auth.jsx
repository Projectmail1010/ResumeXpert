// src/components/Auth.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaSignInAlt, FaUserPlus, FaBuilding, FaEnvelope, FaKey } from 'react-icons/fa';
import '../App.css';

function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [signupData, setSignupData] = useState({
    username: '',
    password: '',
    company: '',
    workEmail: '',
    emailAppKey: '',
  });
  const [loginData, setLoginData] = useState({
    username: '',
    password: '',
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('http://localhost:5000/check-auth', { withCredentials: true })
      .then(response => {
        navigate('/dashboard');
      })
      .catch(error => {
        // Not authenticated, stay here
      })
  }, [navigate]);

  const handleLoginChange = (e) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
  };
  
  const handleSignupChange = (e) => {
    setSignupData({ ...signupData, [e.target.name]: e.target.value.trim() });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!signupData.username || !signupData.password || !signupData.company || !signupData.workEmail) {
      setError('All fields are required.');
      return;
    }
    try {
      const payload = { ...signupData, rememberMe, emailAppKey: signupData.emailAppKey || '' };
      const response = await axios.post('http://localhost:5000/signup', payload, { withCredentials: true });
      localStorage.setItem('username', response.data.user.username);
      localStorage.setItem('company', response.data.user.company);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginData.username || !loginData.password) {
      setError('Required fields missing.');
      return;
    }
    try {
      const payload = { ...loginData, rememberMe };
      const response = await axios.post('http://localhost:5000/login', payload, { withCredentials: true }); 
      localStorage.setItem('username', response.data.user.username);
      localStorage.setItem('company', response.data.user.company);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card animate__animated animate__fadeIn">
        <h2>
          {isLogin ? <><FaSignInAlt /> Login</> : <><FaUserPlus /> Sign Up</>}
        </h2>
        
        {error && <div className="alert alert-danger" style={{ color: 'red', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
        
        {isLogin ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <div className="input-group">
                <input type="text" name="username" placeholder="Enter your username" value={loginData.username} onChange={handleLoginChange} />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" name="password" placeholder="Enter your password" value={loginData.password} onChange={handleLoginChange} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" name="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ width: 'auto', marginRight: '8px' }} />
              <label style={{ margin: 0, fontWeight: 'normal' }}>Remember Me</label>
            </div>
            <button type="submit" className="button" style={{ width: '100%' }}>Login</button>
            <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#64748b' }}>
              New here? <span style={{ color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => { setError(''); setIsLogin(false); }}>Create Account</span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label>Username</label>
              <input type="text" name="username" value={signupData.username} onChange={handleSignupChange} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" name="password" value={signupData.password} onChange={handleSignupChange} />
            </div>
            <div className="form-group">
              <label>Company Name</label>
              <input type="text" name="company" value={signupData.company} onChange={handleSignupChange} />
            </div>
            <div className="form-group">
              <label>Work Email</label>
              <input type="email" name="workEmail" value={signupData.workEmail} onChange={handleSignupChange} />
            </div>
            <div className="form-group">
              <label>Email App Key <small>(Optional)</small></label>
              <input type="text" name="emailAppKey" value={signupData.emailAppKey} onChange={handleSignupChange} />
            </div>
            <button type="submit" className="button" style={{ width: '100%' }}>Create Account</button>
            <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#64748b' }}>
              Already have an account? <span style={{ color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => { setError(''); setIsLogin(true); }}>Login</span>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default Auth;