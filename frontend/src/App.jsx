import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import JobPage from './components/JobPage';
import SelectedCandidates from './components/SelectedCandidates';
import Layout from './components/Layout'; // Import the new Layout

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Route (No Navbar) */}
        <Route path="/" element={<Auth />} />

        {/* Protected Routes (Wrapped in Layout) */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/jobs" element={<JobPage />} />
          <Route path="/candidates" element={<SelectedCandidates />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;