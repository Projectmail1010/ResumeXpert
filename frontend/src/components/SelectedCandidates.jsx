import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../App.css';

function parsePgArray(pgArrayStr) {
  if (!pgArrayStr) return [];
  const trimmed = pgArrayStr.replace(/^\{|\}$/g, '');
  return trimmed.split(',').map(item => item.replace(/^"(.*)"$/, '$1').trim());
}

function SelectedCandidates() {
  const username = localStorage.getItem('username');
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');

  const fetchSelected = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/getSelected', { params: { username } });
      setSelected(response.data.selected);
    } catch (err) {
      console.error(err);
      setMessage('Failed to fetch selected candidates.');
    }
  }, [username]);

  useEffect(() => { fetchSelected(); }, [fetchSelected]);

  return (
    <div className="container animate__animated animate__fadeInUp">
      {message && <div className="alert alert-info">{message}</div>}

      <div className="card">
        <div className="card-header">
          <h4>Candidate Pool</h4>
        </div>
        <div className="card-body">
          {selected.length === 0 ? (
            <p className="text-muted">No candidates selected yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Matched Skills</th>
                    <th>Resume</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((candidate, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: '500' }}>{candidate.name}</td>
                      <td>{candidate.email}</td>
                      <td>{candidate.phone_no}</td>
                      <td>
                        {parsePgArray(candidate.skills).map((skill, i) => (
                          <span key={i} className="skill-badge">{skill}</span>
                        ))}
                      </td>
                      <td>
                        <a 
                          href={`http://localhost:5000/api/download/${candidate.id}?username=${username}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn btn-outline-dark"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SelectedCandidates;