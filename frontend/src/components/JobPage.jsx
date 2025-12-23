import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaPlus, FaTrash } from 'react-icons/fa';
import '../App.css';

function JobPage() {
  const username = localStorage.getItem('username');
  const [jobTitle, setJobTitle] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState([]);
  const [removeJobTitle, setRemoveJobTitle] = useState('');
  const [message, setMessage] = useState('');
  const [skillError, setSkillError] = useState('');
  const [jobs, setJobs] = useState([]);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/getJobs', { params: { username } });
      setJobs(response.data.jobs);
    } catch (err) {
      console.error(err);
      setMessage('Failed to fetch jobs.');
    }
  }, [username]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const isValidSkill = (input) => {
    let inParen = false;
    for (let char of input) {
      if (char === '(') inParen = true;
      else if (char === ')') inParen = false;
      else if (char === ',' && !inParen) return false;
    }
    return true;
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (!skillInput.trim()) { setSkillError('Skill cannot be empty.'); return; }
    if (!isValidSkill(skillInput)) { setSkillError('Invalid format.'); return; }
    if (skills.includes(skillInput.trim())) { setSkillError('Skill already added.'); return; }
    setSkills([...skills, skillInput.trim()]);
    setSkillInput('');
    setSkillError('');
  };

  const handleRemoveSkill = (skill) => {
    setSkills(skills.filter(s => s !== skill));
  };

  const handleAddJob = async (e) => {
    e.preventDefault();
    if (!jobTitle || skills.length === 0) { setMessage('Title and skills required.'); return; }
    try {
      const jobDescription = skills.join(', ');
      await axios.post('http://localhost:5000/addJob', { username, jobTitle, jobDescription });
      setMessage(`Job added successfully.`);
      setJobTitle('');
      setSkills([]);
      fetchJobs();
    } catch (err) { setMessage(err.response?.data?.error || 'Failed to add job.'); }
  };

  const handleRemoveJob = async (e) => {
    e.preventDefault();
    if (!removeJobTitle) return;
    try {
      const response = await axios.post('http://localhost:5000/removeJob', { username, jobTitle: removeJobTitle });
      setMessage(response.data.message);
      setRemoveJobTitle('');
      fetchJobs();
    } catch (err) { setMessage(err.response?.data?.error || 'Failed to remove job.'); }
  };

  return (
    <div className="container animate__animated animate__fadeInUp">
      {message && <div className="alert alert-info">{message}</div>}

      <div className="dashboard-grid">
        {/* Existing Jobs Column */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header"><h4>Current Positions</h4></div>
          <div className="card-body">
            {jobs.length === 0 ? <p>No jobs found.</p> : (
              <div className="table-responsive">
                <table className="table">
                  <thead><tr><th>Title</th><th>Required Skills</th></tr></thead>
                  <tbody>
                    {jobs.map((job, idx) => (
                      <tr key={idx}>
                        <td>{job.job_title}</td>
                        <td>{job.job_description.split(',').map(s => <span key={s} className="skill-badge">{s}</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Action Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Add Job */}
          <div className="card">
            <div className="card-header"><h4>Create New Job</h4></div>
            <div className="card-body">
              <form onSubmit={handleAddJob}>
                <div className="form-group">
                  <label>Job Title</label>
                  <input type="text" className="form-control" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Skills</label>
                  {/* The input-group class now forces side-by-side alignment via Flexbox */}
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      placeholder="e.g. React, Node.js"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddSkill(e)} // Optional: Add on Enter
                    />
                    <button 
                      type="button" 
                      onClick={handleAddSkill} 
                      className="btn btn-primary" // Use primary color for visibility
                    >
                      <FaPlus /> Add
                    </button>
                  </div>
                  {skillError && <small className="text-danger">{skillError}</small>}
                </div>
                {/* New Skills Container with bigger badges */}
                {skills.length > 0 && (
                  <div className="skills-container">
                    {skills.map((skill, index) => (
                      <span key={index} className="skill-badge">
                        {skill}
                        <span 
                          className="delete-icon" 
                          onClick={() => handleRemoveSkill(skill)}
                          title="Remove skill"
                        >
                          <FaTrash size={14} /> {/* Slightly bigger icon */}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                <button type="submit" className="button btn-success" style={{width:'100%'}}>Save Job</button>
              </form>
            </div>
          </div>

          {/* Remove Job */}
          <div className="card">
            <div className="card-header"><h4 style={{color:'var(--danger-color)'}}>Remove Job</h4></div>
            <div className="card-body">
              <form onSubmit={handleRemoveJob}>
                <div className="form-group">
                  <input type="text" className="form-control" placeholder="Enter Job Title" value={removeJobTitle} onChange={(e) => setRemoveJobTitle(e.target.value)} />
                </div>
                <button type="submit" className="button btn-danger" style={{width:'100%'}}>Delete</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobPage;