import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import axios from 'axios';
import './Dashboard.css';

const Dashboard = ({ user }) => {
  const [scenarios, setScenarios] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('scenarios');
  const navigate = useNavigate();

  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [scenariosRes, sessionsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/scenarios`, { headers }),
        axios.get(`${API_BASE_URL}/api/sessions/history`, { headers })
      ]);

      setScenarios(scenariosRes.data);
      setSessions(sessionsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const startRoleplay = (scenarioId) => {
    navigate(`/session/${scenarioId}`);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Sales Roleplay Dashboard</h1>
          <div className="user-info">
            <span>Welcome, {user.email}</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        <nav className="dashboard-nav">
          <button
            className={`nav-button ${activeTab === 'scenarios' ? 'active' : ''}`}
            onClick={() => setActiveTab('scenarios')}
          >
            Practice Scenarios
          </button>
          <button
            className={`nav-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Session History
          </button>
        </nav>

        <main className="dashboard-main">
          {activeTab === 'scenarios' && (
            <div className="scenarios-section">
              <h2>Choose a Practice Scenario</h2>
              {scenarios.length === 0 ? (
                <div className="empty-state">
                  <p>No scenarios available yet. Check back soon!</p>
                  <small>Tip: Ask your administrator to add practice scenarios to your Google Sheet.</small>
                </div>
              ) : (
                <div className="scenarios-grid">
                  {scenarios.map((scenario) => (
                    <div key={scenario.id} className="scenario-card">
                      <h3>{scenario.title}</h3>
                      <p>{scenario.description}</p>
                      <div className="scenario-meta">
                        <span className="difficulty">{scenario.difficulty}</span>
                        <span className="category">{scenario.category}</span>
                      </div>
                      <button
                        onClick={() => startRoleplay(scenario.id)}
                        className="start-button"
                      >
                        Start Practice
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-section">
              <h2>Your Practice History</h2>
              {sessions.length === 0 ? (
                <div className="empty-state">
                  <p>No practice sessions yet. Start your first roleplay!</p>
                </div>
              ) : (
                <div className="sessions-list">
                  {sessions.map((session) => (
                    <div key={session.id} className="session-card">
                      <div className="session-header">
                        <h4>Scenario {session.scenarioId}</h4>
                        <span className="session-date">
                          {new Date(session.startTime).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="session-stats">
                        <div className="stat">
                          <label>Duration:</label>
                          <span>{Math.round(session.duration / 60)} minutes</span>
                        </div>
                        {session.feedback && (
                          <>
                            <div className="stat">
                              <label>Talk Time:</label>
                              <span>{session.feedback.talkTimeRatio}%</span>
                            </div>
                            <div className="stat">
                              <label>Confidence:</label>
                              <span>{session.feedback.confidenceScore}/100</span>
                            </div>
                            <div className="stat">
                              <label>Filler Words:</label>
                              <span>{session.feedback.fillerWordCount}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {session.feedback?.aiFeedback && (
                        <div className="ai-feedback">
                          <h5>AI Feedback:</h5>
                          <p>{session.feedback.aiFeedback}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;