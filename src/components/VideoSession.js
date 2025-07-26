import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DailyIframe from '@daily-co/daily-js';
import axios from 'axios';
import './VideoSession.css';

const VideoSession = ({ user }) => {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  
  // All your existing state variables
  const [callObject, setCallObject] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversation, setConversation] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [waitingForAI, setWaitingForAI] = useState(false);
  
  // ADD THESE MISSING VARIABLES:
  const [scenarioData, setScenarioData] = useState(null);
  
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const lastTranscriptLength = useRef(0);

  const API_BASE_URL = 'https://sales-roleplay-backend-production-468a.up.railway.app';

  // ADD THIS MISSING FUNCTION:
  const goToDashboard = () => {
    navigate('/dashboard');
  };

  // ... rest of your component

  useEffect(() => {
    initializeSession();
    return () => {
      cleanup();
    };
  }, []);

 const cleanup = () => {
  console.log('🧹 Starting cleanup...'); // Debug log
  
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
  
  // Stop speech synthesis (THIS IS KEY!)
  if (window.speechSynthesis) {
    console.log('🧹 Stopping speech synthesis');
    window.speechSynthesis.cancel(); // Stop all speech
    window.speechSynthesis.pause();  // Pause any queued speech
  }
  
  // Clear speech synthesis ref
  if (speechSynthesisRef.current) {
    speechSynthesisRef.current = null;
  }
  
  // Reset AI speaking state
  setIsAISpeaking(false);
  setWaitingForAI(false);
  
  console.log('🧹 Cleanup completed');
};

  const initializeSession = async () => {
  try {
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };

    // ADD: Fetch scenario details first
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
        
        // AI introduces itself
        setTimeout(() => {
          introduceAICharacter();
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


  const introduceAICharacter = () => {
    const introduction = "Hi there! I'm Sarah Mitchell, IT Director here. I'm pretty busy today, so let's see what you've got. What company are you calling from?";
    
    addToConversation('ai', introduction);
    speakText(introduction);
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
        
        if (finalTranscript.trim()) {
          setTranscript(prev => prev + finalTranscript);
          
          // Check if user finished speaking (new final transcript)
          if (finalTranscript.length > 0 && !isAISpeaking && !waitingForAI) {
            handleUserSpeech(finalTranscript.trim());
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  };

  const handleUserSpeech = async (userMessage) => {
    if (userMessage.length < 10) return; // Ignore very short utterances
    
    setWaitingForAI(true);
    addToConversation('user', userMessage);
    
    try {
      const token = await user.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/chat`,
        {
          sessionId: sessionId,
          userMessage: userMessage,
          scenarioId: scenarioId,
          conversationHistory: conversation
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const aiResponse = response.data.response;
      addToConversation('ai', aiResponse);
      
      // Small delay before AI responds (more natural)
      setTimeout(() => {
        speakText(aiResponse);
        setWaitingForAI(false);
      }, 1000);
      
    } catch (error) {
      console.error('Error getting AI response:', error);
      setWaitingForAI(false);
    }
  };

  const addToConversation = (speaker, message) => {
    setConversation(prev => [...prev, {
      speaker,
      message,
      timestamp: Date.now()
    }]);
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      setIsAISpeaking(true);
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      
      // Try to use a female voice for Sarah
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') || 
        voice.name.toLowerCase().includes('samantha') ||
        voice.name.toLowerCase().includes('karen')
      );
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      utterance.onend = () => {
        setIsAISpeaking(false);
      };
      
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

const endSession = async () => {
  alert('End session function called!'); // This should show immediately
  console.log('🔴 END SESSION FUNCTION STARTED');
  
  try {
    console.log('🔴 About to cleanup and redirect');
    cleanup();
    
    // Simple immediate redirect for testing
    console.log('🔴 Navigating to dashboard');
    navigate('/dashboard');
    
  } catch (error) {
    console.log('🔴 Error in endSession:', error);
    alert('Error: ' + error.message);
  }
};

  // ... (keep your existing loading, error, and feedback JSX the same)
 if (feedback) {
  return (
    <div className="video-session">
      <div className="session-header google-ads">
  <div className="session-title">
    <h2>{scenarioData?.title}</h2>
    <div className="session-context">
      <span className="skill-area">{scenarioData?.sales_skill_area}</span>
      <span className="buyer-persona">vs. {scenarioData?.buyer_persona}</span>
      <span className="google-ads-focus">Focus: {scenarioData?.google_ads_focus}</span>
    </div>
  </div>
  
  <div className="session-controls">
    <div className="ai-status">
      {waitingForAI && <span>🤖 {scenarioData?.ai_character_name} is thinking...</span>}
      {isAISpeaking && <span>🗣️ {scenarioData?.ai_character_name} is speaking...</span>}
      {isRecording && !isAISpeaking && <span>🎤 Listening for your response...</span>}
    </div>
    <button onClick={endSession} className="end-session-button">
      End Google Ads Practice
    </button>
  </div>
</div>
        // Update feedback display in VideoSession.js


  return (
    <div className="feedback-container google-ads">
      <div className="feedback-card">
        <h2>🎯 Google Ads Sales Performance</h2>
        <p>Your {feedback?.skillArea || 'sales'} practice session results:</p>
        
        <div className="google-ads-metrics">
          <div className="metric-category">
            <h3>Core Google Ads Skills</h3>
            <div className="metrics-grid">
              <div className="metric">
                <h4>Discovery</h4>
                <div className="score-circle">{feedback?.discovery_score || feedback?.talkTimeRatio || 50}/5</div>
                <p>Asking the right questions</p>
              </div>
              
              <div className="metric">
                <h4>Product Knowledge</h4>
                <div className="score-circle">{feedback?.product_knowledge_score || feedback?.confidenceScore || 50}/5</div>
                <p>Google Ads expertise</p>
              </div>
              
              <div className="metric">
                <h4>Objection Handling</h4>
                <div className="score-circle">{feedback?.objection_handling_score || 3}/5</div>
                <p>Addressing concerns</p>
              </div>
              
              <div className="metric">
                <h4>Solution Fit</h4>
                <div className="score-circle">{feedback?.solution_fit_score || 3}/5</div>
                <p>Matching products to needs</p>
              </div>
            </div>
          </div>
          
          {feedback?.google_ads_concepts_used && feedback.google_ads_concepts_used.length > 0 && (
            <div className="google-ads-concepts">
              <h4>Google Ads Concepts Used</h4>
              <div className="concepts-list">
                {feedback.google_ads_concepts_used.map((concept, index) => (
                  <span key={index} className="concept-tag">{concept}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {feedback?.aiFeedback && (
          <div className="ai-feedback-section google-ads">
            <h3>🎯 Google Ads Coach Feedback</h3>
            <div className="ai-feedback-text">
              {feedback.aiFeedback}
            </div>
          </div>
        )}
        
        {feedback?.coachingRecommendations && feedback.coachingRecommendations.length > 0 && (
          <div className="coaching-recommendations">
            <h4>📚 Next Steps to Improve</h4>
            <ul>
              {feedback.coachingRecommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
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
}
      <div className="video-container" ref={callFrameRef}>
        {/* Daily.co video will appear here */}
      </div>

      <div className="session-info">
        <div className="conversation-section">
          <h3>Live Conversation</h3>
          <div className="conversation-box">
            {conversation.map((msg, index) => (
              <div key={index} className={`message ${msg.speaker}`}>
                <strong>{msg.speaker === 'user' ? 'You' : 'Sarah'}:</strong> {msg.message}
              </div>
            ))}
            {conversation.length === 0 && (
              <p>Conversation will appear here as you talk with Sarah...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoSession;
