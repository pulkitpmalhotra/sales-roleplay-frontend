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

  // Cleanup function with better speech recognition handling
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
      try {
        callObject.destroy();
      } catch (e) {
        console.log('🧹 Error destroying call object:', e);
      }
      setCallObject(null);
    }
    
    // Stop speech recognition
    if (recognitionRef.current) {
      console.log('🧹 Stopping speech recognition');
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      } catch (e) {
        console.log('🧹 Error stopping speech recognition:', e);
      }
      recognitionRef.current = null;
      setIsRecording(false);
    }
    
    // Stop speech synthesis
    if (window.speechSynthesis) {
      console.log('🧹 Stopping speech synthesis');
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.pause();
      } catch (e) {
        console.log('🧹 Error stopping speech synthesis:', e);
      }
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

  // Speech recognition with automatic real-time processing
  const startSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        setIsRecording(true);
      };

      recognition.onresult = (event) => {
        console.log('🎤 Speech recognition result event triggered');
        
        // Only process speech if AI is not speaking and we're not already processing
        if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current) {
          console.log('🎤 Skipping speech - AI busy or already processing');
          return;
        }

        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence;
          
          console.log(`🎤 Result ${i}: "${transcript}" (final: ${event.results[i].isFinal}, confidence: ${confidence})`);
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Show interim results for immediate feedback
        if (interimTranscript.trim()) {
          console.log('🎤 Interim speech:', interimTranscript);
          setUserSpeechBuffer(interimTranscript.trim());
        }
        
        if (finalTranscript.trim()) {
          const cleanedText = finalTranscript.trim();
          console.log('🎤 Final speech detected:', cleanedText);
          
          // Immediately process final speech for real-time conversation
          setUserSpeechBuffer(cleanedText);
          
          // Clear existing timeout
          if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
            console.log('🎤 Cleared existing timeout');
          }
          
          // Process speech immediately for real-time feel
          console.log('🎤 Processing speech immediately for real-time conversation');
          setTimeout(() => {
            processUserSpeechRealtime(cleanedText);
          }, 200); // Very short delay for natural feel
        }
      };

      recognition.onspeechstart = () => {
        console.log('🎤 Speech started being detected');
      };

      recognition.onspeechend = () => {
        console.log('🎤 Speech ended being detected');
        // Clear interim buffer when speech ends
        setUserSpeechBuffer('');
      };

      recognition.onerror = (event) => {
        console.log('🎤 Speech recognition error:', event.error);
        
        switch (event.error) {
          case 'no-speech':
            console.log('🎤 No speech detected - this is normal, continuing...');
            break;
          case 'audio-capture':
            console.error('❌ Audio capture error - microphone issue');
            setError('Microphone not accessible. Please check your microphone and try again.');
            break;
          case 'not-allowed':
            console.error('❌ Microphone permission denied');
            setError('Microphone access denied. Please allow microphone access and refresh.');
            break;
          case 'network':
            console.error('❌ Network error during speech recognition');
            break;
          case 'service-not-allowed':
            console.error('❌ Speech recognition service not allowed');
            setError('Speech recognition service not available. Please try again.');
            break;
          default:
            console.log(`🎤 Speech recognition error: ${event.error} - continuing...`);
            break;
        }
      };

      recognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        
        // Only restart if we haven't manually stopped and session isn't ending
        if (recognitionRef.current && !isEndingSession && !error) {
          console.log('🎤 Restarting speech recognition...');
          setTimeout(() => {
            if (recognitionRef.current && !isEndingSession) {
              try {
                recognition.start();
                console.log('🎤 Speech recognition restarted successfully');
              } catch (e) {
                console.log('🎤 Could not restart recognition immediately, trying again...');
                setTimeout(() => {
                  if (recognitionRef.current && !isEndingSession) {
                    try {
                      recognition.start();
                      console.log('🎤 Speech recognition restarted on second attempt');
                    } catch (e2) {
                      console.error('❌ Failed to restart speech recognition:', e2);
                    }
                  }
                }, 1000);
              }
            }
          }, 100);
        }
      };

      try {
        recognitionRef.current = recognition;
        recognition.start();
        console.log('🎤 Starting speech recognition...');
      } catch (e) {
        console.error('❌ Failed to start speech recognition:', e);
        setError('Could not start speech recognition. Please refresh and try again.');
      }
    } else {
      setError('Speech recognition not supported in this browser. Please use Chrome.');
    }
  };

  // Real-time speech processing with better error handling and logging
  const processUserSpeechRealtime = async (speechText) => {
    console.log('🎯 ===== SPEECH PROCESSING START =====');
    console.log('🎯 Input speech text:', speechText);
    console.log('🎯 Speech text length:', speechText.length);
    console.log('🎯 Current states:', {
      isProcessing: isProcessingUserSpeech.current,
      isAISpeaking,
      waitingForAI,
      sessionId,
      scenarioId
    });
    
    if (!speechText || speechText.length < 3 || isProcessingUserSpeech.current) {
      console.log('🎯 Skipping processing - conditions not met');
      return;
    }

    console.log('🎯 Processing user speech in real-time:', speechText);
    isProcessingUserSpeech.current = true;
    setUserSpeechBuffer(''); // Clear buffer immediately
    setWaitingForAI(true);

    try {
      // Add user message to conversation immediately
      console.log('🎯 Adding USER message to conversation');
      addToConversation('user', speechText);
      setTranscript(prev => prev + `[You]: ${speechText} `);
      
      const token = await user.getIdToken();
      console.log('🔄 Sending request to AI backend...');
      console.log('🔄 API URL:', `${API_BASE_URL}/api/ai/chat`);
      console.log('🔄 Request payload:', {
        sessionId,
        userMessage: speechText,
        scenarioId,
        conversationHistoryLength: conversation.length
      });
      
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/chat`,
        {
          sessionId: sessionId,
          userMessage: speechText,
          scenarioId: scenarioId,
          conversationHistory: conversation
        },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000
        }
      );
      
      console.log('✅ AI backend response received:', response.data);
      const aiResponse = response.data.response;
      const characterName = response.data.character;
      
      if (aiResponse && aiResponse.trim()) {
        console.log('✅ Valid AI response:', aiResponse);
        console.log('✅ Character name:', characterName);
        
        addToConversation('ai', aiResponse);
        setTranscript(prev => prev + `[${characterName}]: ${aiResponse} `);
        setWaitingForAI(false);
        
        // Speak the AI response
        setTimeout(() => {
          speakText(aiResponse);
        }, 500);
      } else {
        throw new Error('Empty AI response received');
      }
      
    } catch (error) {
      console.error('❌ ERROR in speech processing:', error);
      console.error('❌ Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      });
      
      setWaitingForAI(false);
      
      // Better error-specific fallback
      let fallbackResponse;
      if (error.response?.status === 404) {
        fallbackResponse = `I think there's an issue with finding the scenario. Let me try again - what were you saying about your business?`;
      } else if (error.message.includes('timeout')) {
        fallbackResponse = `Sorry, I need a moment to process that. Could you tell me again what you're offering?`;
      } else {
        fallbackResponse = `I apologize, I had trouble understanding. What company are you calling from?`;
      }
      
      console.log('🔄 Using fallback response:', fallbackResponse);
      addToConversation('ai', fallbackResponse);
      setTranscript(prev => prev + `[Customer]: ${fallbackResponse} `);
      
      setTimeout(() => {
        speakText(fallbackResponse);
      }, 300);
      
    } finally {
      console.log('🎯 Speech processing completed, resetting flags');
      isProcessingUserSpeech.current = false;
      console.log('🎯 ===== SPEECH PROCESSING END =====');
    }
  };

  // Add to conversation with role validation to prevent AI confusion
  const addToConversation = (speaker, message) => {
    console.log(`💬 Adding to conversation - ${speaker}: ${message.substring(0, 50)}...`);
    
    // Validate speaker roles to prevent confusion
    if (speaker !== 'user' && speaker !== 'ai') {
      console.error('❌ Invalid speaker role:', speaker);
      return;
    }
    
    // Additional validation: ensure AI isn't speaking as salesperson
    if (speaker === 'ai') {
      const salesPhrases = [
        'let me show you how', 'here\'s what i recommend', 'the best approach is',
        'you should try', 'my suggestion would be', 'what you need to do'
      ];
      
      const seemsLikeSalesAdvice = salesPhrases.some(phrase => 
        message.toLowerCase().includes(phrase)
      );
      
      if (seemsLikeSalesAdvice) {
        console.log('⚠️ AI trying to give sales advice, filtering message');
        message = "Could you tell me more about how this specifically helps my business?";
      }
    }
    
    const newMessage = {
      speaker,
      message,
      timestamp: Date.now()
    };
    
    setConversation(prev => {
      // Prevent duplicate messages
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && 
          lastMessage.speaker === speaker && 
          lastMessage.message === message &&
          Date.now() - lastMessage.timestamp < 2000) {
        console.log('🚫 Preventing duplicate message');
        return prev;
      }
      
      return [...prev, newMessage];
    });
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
            {isRecording && !isAISpeaking && !waitingForAI && (
              <span>🎤 Listening for your response... (speak naturally)</span>
            )}
            {userSpeechBuffer && !waitingForAI && (
              <span>📝 Processing: "{userSpeechBuffer.substring(0, 30)}..."</span>
            )}
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
              {!isAISpeaking && !waitingForAI && isRecording && (
                <div className="listening-indicator">Listening...</div>
              )}
              {!isRecording && !isAISpeaking && !waitingForAI && (
                <div className="ready-indicator">Ready to talk</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="session-info">
        {/* Real-time Speech Feedback */}
        {userSpeechBuffer && (
          <div className="speech-buffer-section">
            <h4>🎤 Currently Speaking:</h4>
            <div className="speech-buffer-box">
              {userSpeechBuffer}
            </div>
          </div>
        )}

        {/* Live Conversation Display */}
        <div className="conversation-section">
          <h3>Live Conversation ({conversation.length} exchanges)</h3>
          <div className="conversation-box">
            {conversation.length === 0 ? (
              <div className="empty-conversation">
                <p>🎯 Your conversation with {scenarioData?.ai_character_name || 'the AI character'} will appear here in real-time...</p>
                <p>💡 <strong>Tips for Natural Conversation:</strong></p>
                <ul>
                  <li>Speak naturally as you would in a real sales call</li>
                  <li>Wait for the AI to finish speaking before responding</li>
                  <li>The conversation flows automatically - no buttons needed!</li>
                </ul>
              </div>
            ) : (
              <div className="messages-container">
                {conversation.map((msg, index) => (
                  <div key={index} className={`message ${msg.speaker}`}>
                    <div className="message-header">
                      <strong>
                        {msg.speaker === 'user' ? '👤 You' : `🤖 ${scenarioData?.ai_character_name || 'AI'}`}
                      </strong>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-content">
                      {msg.message}
                    </div>
                  </div>
                ))}
                {waitingForAI && (
                  <div className="message ai typing">
                    <div className="message-header">
                      <strong>🤖 {scenarioData?.ai_character_name || 'AI'}</strong>
                    </div>
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Full Transcript Display */}
        {transcript && (
          <div className="transcript-section">
            <h4>📝 Session Transcript ({transcript.split(' ').filter(w => w.length > 0).length} words)</h4>
            <div className="transcript-box">
              {transcript || 'Your conversation transcript will appear here...'}
            </div>
          </div>
        )}

        {/* Minimal Debug Information */}
        <div className="debug-info">
          <details>
            <summary>🔍 Session Status</summary>
            <div className="debug-details">
              <p><strong>Character:</strong> {scenarioData?.ai_character_name || 'Loading...'}</p>
              <p><strong>Recording:</strong> {isRecording ? '✅ Active' : '❌ Inactive'}</p>
              <p><strong>AI Status:</strong> {
                isAISpeaking ? '🗣️ Speaking' : 
                waitingForAI ? '🤖 Thinking' : 
                '👂 Listening'
              }</p>
              <p><strong>Exchanges:</strong> {conversation.length}</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default VideoSession;
