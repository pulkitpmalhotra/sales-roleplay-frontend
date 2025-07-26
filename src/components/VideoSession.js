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
  
  // Refs
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);

  const API_BASE_URL = 'https://sales-roleplay-backend-production-468a.up.railway.app';

  // Navigation function
  const goToDashboard = () => {
    navigate('/dashboard');
  };

  // Cleanup function
  const cleanup = () => {
    console.log('🧹 Starting cleanup...');
    
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

  // AI character introduction
  const introduceAICharacter = () => {
    // Get character details from scenario
    const characterName = scenarioData?.ai_character_name || 'Sarah Mitchell';
    const characterRole = scenarioData?.ai_character_role || 'IT Director';
    const characterPersonality = scenarioData?.ai_character_personality || 'Busy, professional';
    const characterBackground = scenarioData?.ai_character_background || 'Works at a tech company';
    const salesSkillArea = scenarioData?.sales_skill_area || 'Sales Practice';
    
    // Create personality-based introduction
    let introduction = '';
    
    // Different introductions based on skill area and personality
    if (salesSkillArea === 'Prospecting & Outreach') {
      if (characterPersonality.toLowerCase().includes('busy') || characterPersonality.toLowerCase().includes('skeptical')) {
        introduction = `Hello, this is ${characterName}, ${characterRole}. I have to say, I'm quite busy right now and wasn't expecting a call. You have about 2 minutes of my attention - what's this about?`;
      } else {
        introduction = `Hi there! ${characterName} here, I'm the ${characterRole}. I have a few minutes - what can I help you with today?`;
      }
    } else if (salesSkillArea === 'Objection Handling') {
      introduction = `${characterName} speaking. Look, I'll be honest with you - I've heard pitches like this before and frankly, I'm not convinced. But go ahead, try to change my mind.`;
    } else if (salesSkillArea === 'Discovery & Consultative Selling') {
      introduction = `Hi, I'm ${characterName}, ${characterRole}. I'm interested in hearing what you have to offer, but I need to understand how this actually helps my business. What do you need to know about us?`;
    } else if (salesSkillArea === 'Pitching & Presenting') {
      introduction = `${characterName} here. I've been looking into solutions like yours. I have some time now - show me what you've got and why I should care.`;
    } else {
      // Default introduction
      introduction = `Hi there! I'm ${characterName}, ${characterRole} here. ${characterBackground.split('.')[0]}. What company are you calling from?`;
    }
    
    console.log('🎭 AI Character Introduction:', introduction);
    addToConversation('ai', introduction);
    speakText(introduction);
  };

  // Speech recognition
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
          
          // Check if user finished speaking
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

  // Handle user speech
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

  // Add to conversation
  const addToConversation = (speaker, message) => {
    setConversation(prev => [...prev, {
      speaker,
      message,
      timestamp: Date.now()
    }]);
  };

  // Text to speech
 const speakText = (text) => {
  if ('speechSynthesis' in window) {
    console.log('🔊 Starting speech synthesis for:', text.substring(0, 50) + '...');
    setIsAISpeaking(true);
    
    // Cancel any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Enhanced voice settings
    utterance.rate = 0.8;  // Slower for clarity
    utterance.pitch = 1.0; // Normal pitch
    utterance.volume = 1.0; // Maximum volume
    utterance.lang = 'en-US'; // Set language
    
    // Wait for voices to be loaded, then select best voice
    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('🔊 Available voices:', voices.length);
      
      if (voices.length === 0) {
        console.log('⚠️ No voices available yet, speaking with default');
      } else {
        // Priority order for female voices
        const preferredVoices = [
          'Microsoft Zira - English (United States)',
          'Google US English Female',
          'Samantha',
          'Karen',
          'Moira',
          'Tessa',
          'Veena'
        ];
        
        let selectedVoice = null;
        
        // Try to find preferred voices
        for (const voiceName of preferredVoices) {
          selectedVoice = voices.find(voice => 
            voice.name.toLowerCase().includes(voiceName.toLowerCase())
          );
          if (selectedVoice) break;
        }
        
        // Fallback: find any female voice
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => 
            voice.name.toLowerCase().includes('female') ||
            voice.name.toLowerCase().includes('woman') ||
            (voice.gender && voice.gender.toLowerCase() === 'female')
          );
        }
        
        // Final fallback: use first English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => 
            voice.lang.startsWith('en-')
          );
        }
        
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log('🔊 Selected voice:', selectedVoice.name);
        } else {
          console.log('⚠️ Using default voice');
        }
      }
      // Add this inside your VideoSession component, before the return statement
const testSpeech = () => {
  console.log('🧪 Testing speech synthesis...');
  
  const testText = "Hello, this is a test of the speech synthesis system.";
  
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(testText);
    utterance.volume = 1.0;
    utterance.rate = 0.8;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => console.log('🔊 Test speech started');
    utterance.onend = () => console.log('🔊 Test speech ended');
    utterance.onerror = (e) => console.error('❌ Test speech error:', e);
    
    window.speechSynthesis.speak(utterance);
  } else {
    console.error('❌ Speech synthesis not supported');
  }
};
      // Event listeners for debugging
      utterance.onstart = () => {
        console.log('🔊 Speech started');
        setIsAISpeaking(true);
      };
      
      utterance.onend = () => {
        console.log('🔊 Speech ended');
        setIsAISpeaking(false);
      };
      
      utterance.onerror = (event) => {
        console.error('❌ Speech error:', event.error);
        setIsAISpeaking(false);
      };
      
      utterance.onpause = () => {
        console.log('⏸️ Speech paused');
      };
      
      utterance.onresume = () => {
        console.log('▶️ Speech resumed');
      };
      
      // Speak the text
      speechSynthesisRef.current = utterance;
      console.log('🔊 About to speak...');
      window.speechSynthesis.speak(utterance);
    };
    
    // Check if voices are already loaded
    if (window.speechSynthesis.getVoices().length > 0) {
      setVoiceAndSpeak();
    } else {
      // Wait for voices to load
      console.log('⏳ Waiting for voices to load...');
      window.speechSynthesis.onvoiceschanged = () => {
        console.log('✅ Voices loaded');
        setVoiceAndSpeak();
        window.speechSynthesis.onvoiceschanged = null; // Remove listener
      };
    }
  } else {
    console.error('❌ Speech synthesis not supported');
    setIsAISpeaking(false);
  }
};
  // End session
  const endSession = async () => {
  try {
    console.log('🔍 ===== FRONTEND END SESSION DEBUG =====');
    setIsEndingSession(true);
    cleanup();

    const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;

    console.log('🔍 Session data being sent:', {
      sessionId,
      duration,
      conversationLength: conversation.length,
      transcriptLength: transcript.length
    });

    const token = await user.getIdToken();
    console.log('🔍 Making request to end session...');
    
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

    console.log('✅ Backend response received');
    console.log('✅ Response status:', response.status);
    console.log('✅ Response data:', response.data);
    console.log('✅ Analysis in response:', response.data?.analysis);

    if (response.data && response.data.analysis) {
      console.log('✅ Setting feedback state...');
      setFeedback(response.data.analysis);
      console.log('✅ Feedback state set - should show feedback screen now');
    } else {
      console.error('❌ No analysis in response - redirecting to dashboard');
      setTimeout(() => navigate('/dashboard'), 2000);
    }
    
    setIsEndingSession(false);
    console.log('🔍 ===== FRONTEND END SESSION COMPLETE =====');

  } catch (error) {
    console.error('❌ Frontend error ending session:', error);
    console.error('❌ Error response data:', error.response?.data);
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

  // Show initial loading (only when first starting)
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

  // Feedback state
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

  // Active session state
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
            {isRecording && !isAISpeaking && <span>🎤 Listening for your response...</span>}
          </div>
          <button onClick={endSession} className="end-session-button">
            End Google Ads Practice
          </button>
        </div>
      </div>

      <div className="video-container" ref={callFrameRef}>
        {/* Daily.co video will appear here */}
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
