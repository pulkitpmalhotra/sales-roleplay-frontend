import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DailyIframe from '@daily-co/daily-js';
import axios from 'axios';
import './VideoSession.css';

const VideoSession = ({ user }) => {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  const [callObject, setCallObject] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);

  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  useEffect(() => {
    initializeSession();
    return () => {
      if (callObject) {
        callObject.destroy();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const initializeSession = async () => {
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Create video room
      const roomResponse = await axios.post(
        `${API_BASE_URL}/api/video/create-room`,
        {},
        { headers }
      );

      // Start session
      const sessionResponse = await axios.post(
        `${API_BASE_URL}/api/sessions/start`,
        {
          scenarioId: scenarioId,
          roomUrl: roomResponse.data.roomUrl
        },
        { headers }
      );

      setSessionId(sessionResponse.data.sessionId);
      
      // Initialize Daily.co call
      const daily = DailyIframe.createCallObject({
        url: roomResponse.data.roomUrl
      });

      setCallObject(daily);
      
      // Set up call event listeners
      daily.on('joined-meeting', () => {
        setLoading(false);
        setSessionStartTime(Date.now());
        startSpeechRecognition();
      });

      daily.on('error', (error) => {
        console.error('Daily.co error:', error);
        setError('Video call failed to start');
        setLoading(false);
      });

      // Join the call
      await daily.join();

    } catch (error) {
      console.error('Error initializing session:', error);
      setError('Failed to start session');
      setLoading(false);
    }
  };

  const startSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } else {
      console.warn('Speech recognition not supported');
    }
  };

  const endSession = async () => {
    try {
      setLoading(true);
      
      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
      }

      // Leave video call
      if (callObject) {
        await callObject.leave();
      }

      // Calculate duration
      const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;

      // Send session data to backend
      const token = await user.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/api/sessions/end`,
        {
          sessionId: sessionId,
          transcript: transcript,
          duration: duration
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setFeedback(response.data.analysis);
      setLoading(false);

    } catch (error) {
      console.error('Error ending session:', error);
      setError('Failed to end session');
      setLoading(false);
    }
  };

  const goToDashboard = () => {
    navigate('/dashboard');
  };

  if (loading && !feedback) {
    return (
      <div className="session-loading">
        <div className="loading-spinner"></div>
        <p>{sessionId ? 'Starting your practice session...' : 'Initializing...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-error">
        <h2>Session Error</h2>
        <p>{error}</p>
        <button onClick={goToDashboard} className="back-button">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (feedback) {
    return (
      <div className="feedback-container">
        <div className="feedback-card">
          <h2>Session Complete!</h2>
          <p>Here's your performance analysis:</p>
          
          <div className="metrics-grid">
            <div className="metric">
              <h3>Talk Time Ratio</h3>
              <div className="metric-value">{feedback.talkTimeRatio}%</div>
              <p>Percentage of time you were speaking</p>
            </div>
            
            <div className="metric">
              <h3>Confidence Score</h3>
              <div className="metric-value">{feedback.confidenceScore}/100</div>
              <p>Based on speech patterns and filler words</p>
            </div>
            
            <div className="metric">
              <h3>Filler Words</h3>
              <div className="metric-value">{feedback.fillerWordCount}</div>
              <p>Times you used "um", "uh", "like", etc.</p>
            </div>
          </div>

          {feedback.aiFeedback && (
            <div className="ai-feedback-section">
              <h3>AI Coach Feedback</h3>
              <div className="ai-feedback-text">
                {feedback.aiFeedback}
              </div>
            </div>
          )}

          <div className="feedback-actions">
            <button onClick={goToDashboard} className="primary-button">
              Back to Dashboard
            </button>
            <button 
              onClick={() => window.location.reload()} 
              className="secondary-button"
            >
              Practice Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="video-session">
      <div className="session-header">
        <h2>Practice Session - Scenario {scenarioId}</h2>
        <div className="session-controls">
          <div className="recording-indicator">
            {isRecording && (
              <>
                <div className="recording-dot"></div>
                <span>Recording Speech</span>
              </>
            )}
          </div>
          <button onClick={endSession} className="end-session-button">
            End Session
          </button>
        </div>
      </div>

      <div className="video-container" ref={callFrameRef}>
        {/* Daily.co iframe will be inserted here automatically */}
      </div>

      <div className="session-info">
        <div className="transcript-section">
          <h3>Live Transcript</h3>
          <div className="transcript-box">
            {transcript || 'Start speaking to see your transcript...'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoSession;