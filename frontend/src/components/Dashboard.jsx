import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBriefcase, FaUsers, FaTrash, FaFileAlt } from 'react-icons/fa';
import '../App.css';
import axios from 'axios';

function Dashboard() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username');

  // Account Deletion Logic
  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete your account? This action cannot be undone.");
    if (!confirmDelete) return;

    try {
      const response = await fetch('http://localhost:5000/deleteAccount', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      if (response.ok) {
        alert("Account deleted successfully.");
        // Force logout via window or re-trigger auth flow
        window.location.href = "/";
      } else {
        alert("Failed to delete account. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Error deleting account.");
    }
  };

  return (
    <div className="container animate__animated animate__fadeIn">
      <div className="card-header" style={{ border: 'none', paddingLeft: 0, background: 'transparent' }}>
        <h4>Overview</h4>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Manage your recruitment pipeline efficiently.
        </p>
      </div>

      <div className="dashboard-grid">
        <div className="action-card" onClick={() => navigate('/jobs')}>
          <div className="icon"><FaBriefcase /></div>
          <h3>Manage Jobs</h3>
          <p>Create and edit job descriptions and requirements.</p>
        </div>

        <div className="action-card" onClick={() => navigate('/candidates')}>
          <div className="icon"><FaUsers /></div>
          <h3>Selected Candidates</h3>
          <p>View resumes that matched your job criteria.</p>
        </div>

        <div className="action-card">
          <div className="icon"><FaFileAlt /></div>
          <h3>Upload Resumes</h3>
          <p>Batch upload resumes for processing (Coming Soon).</p>
        </div>

        <div className="action-card" onClick={handleDeleteAccount} style={{ borderColor: 'var(--danger-color)' }}>
          <div className="icon" style={{ color: 'var(--danger-color)' }}><FaTrash /></div>
          <h3 style={{ color: 'var(--danger-color)' }}>Delete Account</h3>
          <p>Permanently remove your data and access.</p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;