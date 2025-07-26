import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DailyIframe from '@daily-co/daily-js';
import axios from 'axios';
import './VideoSession.css';

const VideoSession = ({ user }) => {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  
  // State variables
  const [callObject, setCallObject] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversation, setConversation] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [waitingForAI, setWaitingForAI] = useState(false);
  const [scenarioData, setScenarioData] = useState(null);
  const [userSpeechBuffer, setUserSpeechBuffer] = useState('');
  const [lastUserSpeechTime, setLastUserSpeechTime] = useState(0);
  const [hasIntroduced, setHasIntroduced] = useState(false);
  
  // Refs
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const speechTimeoutRef = useRef(null);
  const isProcessingUserSpeech = useRef(false);

  const API_BASE_URL = 'https://sales-roleplay-backend-production-468a.up.railway.app';

  // Navigation function
  const goToDashboard = () => {
    navigate('/dashboard');
  };

  // Cleanup function
  const cleanup = () => {
    console.log('🧹 Starting cleanup...');
    
    // Clear any timeouts
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    
    // Stop Daily.co call
    if (callObject) {
      console.log('🧹 Destroying Daily.co call');
      callObject.destroy();
      setCallObject(null);
    }
    
    // Stop speech recognition
    if (recognitionRef.current) {
      console.log('🧹 Stopping speech recognition');
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
    }
    
    // Stop speech synthesis
    if (window.speechSynthesis) {
      console.log('🧹 Stopping speech synthesis');
      window.speechSynthesis.cancel();
      window.speechSynthesis.pause();
    }
    
    // Clear speech synthesis ref
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current = null;
    }
    
    // Reset AI speaking state
    setIsAISpeaking(false);
    setWaitingForAI(false);
    setUserSpeechBuffer('');
    isProcessingUserSpeech.current = false;
    
    console.log('🧹 Cleanup completed');
  };

  // Initialize session
  const initializeSession = async () => {
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch scenario details first
      const scenarioResponse = await axios.get(
        `${API_BASE_URL}/api/scenarios`,
        { headers }
      );
      
      const currentScenario = scenarioResponse.data.find(s => 
        s.scenario_id === scenarioId || s.id === scenarioId
      );
      
      setScenarioData(currentScenario);

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
        
        // AI introduces itself after a delay
        setTimeout(() => {
          if (!hasIntroduced) {
            introduceAICharacter();
          }
        }, 2000);
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

  // AI character introduction
  const introduceAICharacter = async () => {
    if (hasIntroduced || isAISpeaking || waitingForAI) {
      console.log('🎭 Skipping introduction - already done or AI busy');
      return;
    }

    setHasIntroduced(true);
    setWaitingForAI(true);

    try {
      console.log('🎭 Getting AI introduction...');
      const token = await user.getIdToken();
      
      // Use the AI chat endpoint to get a proper introduction
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/chat`,
        {
          sessionId: sessionId,
          userMessage: "SYSTEM_INTRODUCTION", // Special message to trigger introduction
          scenarioId: scenarioId,
          conversationHistory: []
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const introduction = response.data.response;
      console.log('🎭 AI Introduction received:', introduction);
      
      addToConversation('ai', introduction);
      setWaitingForAI(false);
      
      // Small delay before speaking
      setTimeout(() => {
        speakText(introduction);
      }, 500);
      
    } catch (error) {
      console.error('❌ Error getting AI introduction:', error);
      setWaitingForAI(false);
      
      // Fallback introduction
      const fallbackIntro = `Hello! I'm ${scenarioData?.ai_character_name || 'the customer'}. What can I help you with today?`;
      addToConversation('ai', fallbackIntro);
      speakText(fallbackIntro);
    }
  };

  // Speech recognition with improved logic
  const startSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        // Only process speech if AI is not speaking and we're not already processing
        if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current) {
          return;
        }

        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        
        if (finalTranscript.trim()) {
          const cleanedText = finalTranscript.trim();
          console.log('🎤 User speech detected:', cleanedText);
          
          // Update buffer and timestamp
          setUserSpeechBuffer(prev => prev + ' ' + cleanedText);
          setLastUserSpeechTime(Date.now());
          
          // Clear existing timeout
          if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
          }
          
          // Set new timeout to process speech after user stops talking
          speechTimeoutRef.current = setTimeout(() => {
            processUserSpeech();
          }, 2000); // Wait 2 seconds after user stops talking
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access and refresh.');
        }
      };

      recognition.onend = () => {
        // Restart recognition if not manually stopped
        if (recognitionRef.current && !isEndingSession) {
          setTimeout(() => {
            if (recognitionRef.current) {
              recognition.start();
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } else {
      setError('Speech recognition not supported in this browser. Please use Chrome.');
    }
  };

  // Process accumulated user speech
  const processUserSpeech = async () => {
    const currentBuffer = userSpeechBuffer.trim();
    
    if (!currentBuffer || currentBuffer.length < 10 || isProcessingUserSpeech.current) {
      return;
    }

    console.log('🎯 Processing user speech:', currentBuffer);
    isProcessingUserSpeech.current = true;
    setUserSpeechBuffer(''); // Clear buffer
    setWaitingForAI(true);

    try {
      // Add user message to conversation
      addToConversation('user', currentBuffer);
      setTranscript(prev => prev + currentBuffer + ' ');
      
      const token = await user.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/chat`,
        {
          sessionId: sessionId,
          userMessage: currentBuffer,
          scenarioId: scenarioId,
          conversationHistory: conversation
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const aiResponse = response.data.response;
      console.log('🤖 AI response received:', aiResponse);
      
      addToConversation('ai', aiResponse);
      setWaitingForAI(false);
      
      // Small delay before AI responds (more natural)
      setTimeout(() => {
        speakText(aiResponse);
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error getting AI response:', error);
      setWaitingForAI(false);
      
      // Fallback response
      const fallbackResponse = "I'm sorry, could you repeat that? I didn't catch what you said.";
      addToConversation('ai', fallbackResponse);
      speakText(fallbackResponse);
    } finally {
      isProcessingUserSpeech.current = false;
    }
  };

  // Add to conversation with better logging
  const addToConversation = (speaker, message) => {
    console.log(`💬 Adding to conversation - ${speaker}: ${message.substring(0, 50)}...`);
    setConversation(prev => [...prev, {
      speaker,
      message,
      timestamp: Date.now()
    }]);
  };

  // Enhanced text to speech
  const speakText = (text) => {
    if ('speechSynthesis' in window && text.trim()) {
      console.log('🔊 Starting speech synthesis for:', text.substring(0, 50) + '...');
      setIsAISpeaking(true);
      
      // Cancel any existing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Enhanced voice settings
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';
      
      // Set voice
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') ||
        voice.name.toLowerCase().includes('zira') ||
        voice.name.toLowerCase().includes('samantha')
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      // Event listeners
      utterance.onstart = () => {
        console.log('🔊 Speech started');
        setIsAISpeaking(true);
      };
      
      utterance.onend = () => {
        console.log('🔊 Speech ended');
        setIsAISpeaking(false);
        speechSynthesisRef.current = null;
      };
      
      utterance.onerror = (event) => {
        console.error('❌ Speech error:', event.error);
        setIsAISpeaking(false);
        speechSynthesisRef.current = null;
      };
      
      // Speak the text
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } else {
      console.error('❌ Speech synthesis not supported or empty text');
      setIsAISpeaking(false);
    }
  };

  // End session (existing code remains the same)
  const endSession = async () => {
    try {
      console.log('🔍 ===== FRONTEND END SESSION DEBUG =====');
      setIsEndingSession(true);
      cleanup();

      const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;

      const token = await user.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/api/sessions/end`,
        {
          sessionId: sessionId,
          transcript: transcript,
          duration: duration,
          conversationHistory: conversation
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data && response.data.analysis) {
        setFeedback(response.data.analysis);
      } else {
        setTimeout(() => navigate('/dashboard'), 2000);
      }
      
      setIsEndingSession(false);

    } catch (error) {
      console.error('❌ Frontend error ending session:', error);
      setIsEndingSession(false);
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    }
  };

  // Component lifecycle
  useEffect(() => {
    initializeSession();
    return () => {
      cleanup();
    };
  }, []);

  // Show ending session loading
  if (isEndingSession) {
    return (
      <div className="session-loading">
        <div className="loading-spinner"></div>
        <p>Ending your practice session and generating feedback...</p>
      </div>
    );
  }

  // Show initial loading
  if (loading && !feedback) {
    return (
      <div className="session-loading">
        <div className="loading-spinner"></div>
        <p>{sessionId ? 'Starting your practice session...' : 'Initializing...'}</p>
      </div>
    );
  }

  // Error state
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

  // Feedback state (existing code remains the same)
  if (feedback) {
    return (
      <div className="feedback-container google-ads">
        <div className="feedback-card">
          <h2>🎯 Google Ads Sales Performance</h2>
          <p>Your {feedback?.skillArea || scenarioData?.sales_skill_area || 'sales'} practice session results:</p>
          
          <div className="google-ads-metrics">
            <div className="metric-category">
              <h3>Core Google Ads Skills</h3>
              <div className="metrics-grid">
                <div className="metric">
                  <h4>Talk Time</h4>
                  <div className="score-circle">{feedback?.talkTimeRatio || 50}%</div>
                  <p>Percentage of time speaking</p>
                </div>
                
                <div className="metric">
                  <h4>Confidence</h4>
                  <div className="score-circle">{feedback?.confidenceScore || 75}/100</div>
                  <p>Based on speech patterns</p>
                </div>
                
                <div className="metric">
                  <h4>Filler Words</h4>
                  <div className="score-circle">{feedback?.fillerWordCount || 0}</div>
                  <p>Times you used "um", "uh", etc.</p>
                </div>
                
                <div className="metric">
                  <h4>Conversation</h4>
                  <div className="score-circle">{conversation.length}</div>
                  <p>Number of exchanges</p>
                </div>
              </div>
            </div>
          </div>

          {feedback?.aiFeedback && (
            <div className="ai-feedback-section google-ads">
              <h3>🎯 Google Ads Coach Feedback</h3>
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

  // Active session state with AI avatar
  return (
    <div className="video-session">
      <div className="session-header google-ads">
        <div className="session-title">
          <h2>{scenarioData?.title || 'Google Ads Practice Session'}</h2>
          <div className="session-context">
            <span className="skill-area">{scenarioData?.sales_skill_area || 'Sales Skills'}</span>
            <span className="buyer-persona">vs. {scenarioData?.buyer_persona || 'Customer'}</span>
            <span className="google-ads-focus">Focus: {scenarioData?.google_ads_focus || 'General'}</span>
          </div>
        </div>
        
        <div className="session-controls">
          <div className="ai-status">
            {waitingForAI && <span>🤖 {scenarioData?.ai_character_name || 'AI'} is thinking...</span>}
            {isAISpeaking && <span>🗣️ {scenarioData?.ai_character_name || 'AI'} is speaking...</span>}
            {isRecording && !isAISpeaking && !waitingForAI && <span>🎤 Listening for your response...</span>}
          </div>
          <button onClick={endSession} className="end-session-button">
            End Google Ads Practice
          </button>
        </div>
      </div>

      <div className="video-container" ref={callFrameRef}>
        {/* AI Avatar Overlay */}
        <div className="ai-avatar-overlay">
          <div className={`ai-avatar ${isAISpeaking ? 'speaking' : ''} ${waitingForAI ? 'thinking' : ''}`}>
            <div className="avatar-image">
              <div className="avatar-placeholder">
                {scenarioData?.ai_character_name ? scenarioData.ai_character_name.charAt(0) : 'AI'}
              </div>
            </div>
            <div className="avatar-status">
              <div className="character-name">{scenarioData?.ai_character_name || 'AI Character'}</div>
              <div className="character-role">{scenarioData?.ai_character_role || 'Customer'}</div>
              {isAISpeaking && <div className="speaking-indicator">Speaking...</div>}
              {waitingForAI && <div className="thinking-indicator">Thinking...</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="session-info">
        <div className="conversation-section">
          <h3>Live Conversation</h3>
          <div className="conversation-box">
            {conversation.map((msg, index) => (
              <div key={index} className={`message ${msg.speaker}`}>
                <strong>{msg.speaker === 'user' ? 'You' : scenarioData?.ai_character_name || 'AI'}:</strong> {msg.message}
              </div>
            ))}
            {conversation.length === 0 && (
              <p>Conversation will appear here as you talk with {scenarioData?.ai_character_name || 'the AI character'}...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoSession;
