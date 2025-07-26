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
  
  
const [sessionsData, setSessionsData] = useState({ sessions: [], pagination: {}, summary: {} });
  const [sessionFilters, setSessionFilters] = useState({
    scenario: 'all',
    limit: 6,
    offset: 0
  });
  const [selectedSession, setSelectedSession] = useState(null);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
const [skillAreaFilter, setSkillAreaFilter] = useState('all');
const [verticalFilter, setVerticalFilter] = useState('all');
  
  const navigate = useNavigate();
  const API_BASE_URL = 'https://sales-roleplay-backend-production-468a.up.railway.app';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
  try {
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };

    const [scenariosRes, sessionsRes] = await Promise.all([
      axios.get(`${API_BASE_URL}/api/scenarios`, { headers }),
      axios.get(`${API_BASE_URL}/api/sessions/history?${new URLSearchParams(sessionFilters)}`, { headers })
    ]);

    setScenarios(scenariosRes.data);
    setSessionsData(sessionsRes.data);
    setSessions(sessionsRes.data.sessions || []); // Keep for compatibility
  } catch (error) {
    console.error('Error loading data:', error);
  }
  setLoading(false);
};
const loadMoreSessions = async () => {
  try {
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };
    
    const newFilters = {
      ...sessionFilters,
      offset: sessionFilters.offset + sessionFilters.limit
    };
    
    const response = await axios.get(
      `${API_BASE_URL}/api/sessions/history?${new URLSearchParams(newFilters)}`, 
      { headers }
    );
    
    setSessionsData(prev => ({
      ...response.data,
      sessions: [...prev.sessions, ...response.data.sessions]
    }));
    
    setSessionFilters(newFilters);
  } catch (error) {
    console.error('Error loading more sessions:', error);
  }
};

const handleFilterChange = (filterType, value) => {
  const newFilters = {
    ...sessionFilters,
    [filterType]: value,
    offset: 0 // Reset pagination when filtering
  };
  
  setSessionFilters(newFilters);
  
  // Reload data with new filters
  setTimeout(() => loadData(), 100);
};

const viewSessionDetails = async (sessionId) => {
  try {
    const token = await user.getIdToken();
    const response = await axios.get(
      `${API_BASE_URL}/api/sessions/${sessionId}/details`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    setSelectedSession(response.data);
    setShowSessionDetails(true);
  } catch (error) {
    console.error('Error loading session details:', error);
  }
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
                // Update scenario card display
<div className="scenarios-grid">
  {scenarios.map((scenario) => (
    <div key={scenario.scenario_id} className="scenario-card google-ads">
      <div className="scenario-header">
        <h3>{scenario.title}</h3>
        <div className="scenario-badges">
          <span className={`skill-badge ${scenario.sales_skill_area.toLowerCase().replace(/\s+/g, '-')}`}>
            {scenario.sales_skill_area}
          </span>
          <span className="difficulty-badge">{scenario.difficulty}</span>
        </div>
      </div>
      
      <p>{scenario.description}</p>
      
      <div className="scenario-details">
        <div className="detail-row">
          <strong>Buyer:</strong> {scenario.buyer_persona}
        </div>
        <div className="detail-row">
          <strong>Focus:</strong> {scenario.google_ads_focus}
        </div>
        <div className="detail-row">
          <strong>Vertical:</strong> {scenario.business_vertical}
        </div>
        <div className="detail-row">
          <strong>Goal:</strong> {scenario.scenario_objectives}
        </div>
      </div>
      
      <button
        onClick={() => startRoleplay(scenario.scenario_id)}
        className="start-button google-ads"
      >
        Start Google Ads Practice
      </button>
    </div>
  ))}
</div>
              )}
            </div>
          )}

         {activeTab === 'history' && (
  <div className="history-section">
    <div className="history-header">
      <h2>Your Practice History</h2>
      
      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <span className="stat-number">{sessionsData.summary.totalSessions || 0}</span>
          <span className="stat-label">Total Sessions</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{sessionsData.summary.avgConfidenceScore || 0}</span>
          <span className="stat-label">Avg Confidence</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{sessionsData.summary.avgDurationMinutes || 0}m</span>
          <span className="stat-label">Avg Duration</span>
        </div>
      </div>
      
      {/* Filters */}
      <div className="session-filters">
  <select 
    value={skillAreaFilter} 
    onChange={(e) => {
      setSkillAreaFilter(e.target.value);
      // Reload scenarios with filter
    }}
    className="filter-select"
  >
    <option value="all">All Skill Areas</option>
    <option value="Prospecting & Outreach">Prospecting & Outreach</option>
    <option value="Discovery & Consultative Selling">Discovery & Consultative Selling</option>
    <option value="Objection Handling">Objection Handling</option>
    <option value="Pitching & Presenting">Pitching & Presenting</option>
    <option value="Optimization & Renewals">Optimization & Renewals</option>
  </select>
  
  <select 
    value={verticalFilter} 
    onChange={(e) => setVerticalFilter(e.target.value)}
    className="filter-select"
  >
    <option value="all">All Verticals</option>
    <option value="Local Business">Local Business</option>
    <option value="E-commerce">E-commerce</option>
    <option value="B2B SaaS">B2B SaaS</option>
    <option value="Retail">Retail</option>
    <option value="Agency">Agency</option>
  </select>
</div>

    {sessionsData.sessions.length === 0 ? (
      <div className="empty-state">
        <p>No practice sessions yet. Start your first roleplay!</p>
      </div>
    ) : (
      <>
        <div className="sessions-grid">
          {sessionsData.sessions.map((session) => (
            <div key={session.id} className="session-card-compact">
              <div className="session-card-header">
                <div className="scenario-info">
                  <h4>{session.scenarioTitle}</h4>
                  <div className="scenario-badges">
                    <span className={`difficulty-badge ${session.scenarioDifficulty.toLowerCase()}`}>
                      {session.scenarioDifficulty}
                    </span>
                    <span className="category-badge">{session.scenarioCategory}</span>
                  </div>
                </div>
                <div className="session-date">
                  {new Date(session.startTime).toLocaleDateString()}
                </div>
              </div>
              
              {session.feedback && (
                <div className="session-metrics">
                  <div className="metric-item">
                    <span className="metric-value">{session.feedback.confidenceScore}</span>
                    <span className="metric-label">Confidence</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-value">{Math.round(session.duration / 60000)}m</span>
                    <span className="metric-label">Duration</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-value">{session.feedback.conversationLength}</span>
                    <span className="metric-label">Exchanges</span>
                  </div>
                </div>
              )}
              
              <div className="session-actions">
                <button 
                  onClick={() => viewSessionDetails(session.id)}
                  className="view-details-btn"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Load More Button */}
        {sessionsData.pagination.hasMore && (
          <div className="load-more-container">
            <button onClick={loadMoreSessions} className="load-more-btn">
              Load More Sessions
            </button>
          </div>
        )}
      </>
    )}
  </div>
)}
   </div> 
</main>
      </div>
  {showSessionDetails && selectedSession && (
        <div className="modal-overlay" onClick={() => setShowSessionDetails(false)}>
          <div className="session-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedSession.scenario?.title}</h3>
              <button 
                className="close-modal-btn"
                onClick={() => setShowSessionDetails(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="session-overview">
                <div className="overview-stat">
                  <strong>Duration:</strong> {Math.round(selectedSession.session.duration / 60000)} minutes
                </div>
                <div className="overview-stat">
                  <strong>Date:</strong> {new Date(selectedSession.session.startTime).toLocaleString()}
                </div>
                <div className="overview-stat">
                  <strong>Status:</strong> {selectedSession.session.status}
                </div>
              </div>
              
              {selectedSession.feedback && (
                <div className="detailed-metrics">
                  <h4>Performance Metrics</h4>
                  <div className="metrics-row">
                    <div className="metric-detail">
                      <span className="metric-number">{selectedSession.feedback.confidenceScore}</span>
                      <span className="metric-title">Confidence Score</span>
                    </div>
                    <div className="metric-detail">
                      <span className="metric-number">{selectedSession.feedback.talkTimeRatio}%</span>
                      <span className="metric-title">Talk Time</span>
                    </div>
                    <div className="metric-detail">
                      <span className="metric-number">{selectedSession.feedback.fillerWordCount}</span>
                      <span className="metric-title">Filler Words</span>
                    </div>
                  </div>
                </div>
              )}
              
              {selectedSession.feedback?.aiFeedback && (
                <div className="ai-feedback-detail">
                  <h4>AI Coach Feedback</h4>
                  <p>{selectedSession.feedback.aiFeedback}</p>
                </div>
              )}
              
              {selectedSession.conversationHistory && selectedSession.conversationHistory.length > 0 && (
                <div className="conversation-replay">
                  <h4>Conversation Replay</h4>
                  <div className="conversation-messages">
                    {selectedSession.conversationHistory.map((exchange, index) => (
                      <div key={index} className="conversation-exchange">
                        <div className="user-message">
                          <strong>You:</strong> {exchange.userMessage}
                        </div>
                        <div className="ai-message">
                          <strong>Sarah:</strong> {exchange.aiResponse}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
