import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FaBriefcase, FaSignOutAlt, FaHome } from 'react-icons/fa';
import axios from 'axios';
import '../App.css';

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Retrieve user info from local storage
  const username = localStorage.getItem('username');
  const company = localStorage.getItem('company');

  // Handle Logout Logic Here (Centralized)
  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:5000/logout', {}, { withCredentials: true });
      localStorage.removeItem('username');
      localStorage.removeItem('company');
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Dynamic Title Logic based on current path
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/jobs':
        return `${company}'s Job Portal`;
      case '/candidates':
        return 'Selected Candidates';
      case '/dashboard':
      default:
        return 'ResumeXpert Dashboard';
    }
  };

  return (
    <div className="app-layout">
      {/* --- Static Navbar --- */}
      <nav className="custom-navbar">
        <div className="custom-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <FaBriefcase size={24} />
          {/* The Site Name changes here based on the route */}
          <span>{getPageTitle()}</span>
        </div>

        <div className="nav-user-info">
          {/* Optional: Add a Dashboard Home button if not on dashboard */}
          {location.pathname !== '/dashboard' && (
             <button className="btn btn-outline-dark" onClick={() => navigate('/dashboard')}>
               <FaHome /> Dashboard
             </button>
          )}
          
          <span className="custom-welcome">
            Welcome, <strong>{username}</strong>
          </span>
          
          <button className="btn btn-outline-dark" onClick={handleLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </nav>

      {/* --- Dynamic Body Content --- */}
      <main className="layout-content">
        {/* <Outlet /> renders the child route's element (Dashboard, JobPage, etc.) */}
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;