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
  const [isListening, setIsListening] = useState(false);
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState('unknown');
  const [debugInfo, setDebugInfo] = useState([]);
  
  // Refs
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const isProcessingUserSpeech = useRef(false);
  const restartRecognitionTimeout = useRef(null);

  const API_BASE_URL = 'https://sales-roleplay-backend-production-468a.up.railway.app';

  // Navigation function
  const goToDashboard = () => {
    navigate('/dashboard');
  };

  // Add debug message helper
  const addDebugMessage = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev.slice(-4), `${timestamp}: ${message}`]);
    console.log(`🔍 DEBUG: ${message}`);
  };

  // Simplified speech recognition start
  const startSpeechRecognition = () => {
    // Don't start if AI is busy or already processing
    if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current || recognitionRef.current) {
      addDebugMessage('🚫 Cannot start recognition - AI busy or already active');
      return;
    }

    if (!('webkitSpeechRecognition' in window)) {
      addDebugMessage('❌ Speech recognition not supported');
      setError('Speech recognition not supported. Please use Chrome browser.');
      return;
    }

    try {
      addDebugMessage('🎤 Starting speech recognition...');
      
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        addDebugMessage('✅ Speech recognition started');
        setIsRecording(true);
        setRecognitionActive(true);
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        // Skip if AI is currently busy
        if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current) {
          addDebugMessage('🚫 Ignoring speech - AI is busy');
          return;
        }

        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Update buffer with interim results
        if (interimTranscript) {
          setUserSpeechBuffer(interimTranscript.trim());
        }

        // Process final results
        if (finalTranscript && finalTranscript.trim().length > 2) {
          addDebugMessage(`🎯 Final speech: "${finalTranscript.trim()}"`);
          setUserSpeechBuffer('');
          processUserSpeech(finalTranscript.trim());
        }
      };

      recognition.onerror = (event) => {
        addDebugMessage(`❌ Recognition error: ${event.error}`);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access.');
          setMicrophonePermission('denied');
        }
        
        // Clean up and try to restart after error
        setRecognitionActive(false);
        setIsListening(false);
        recognitionRef.current = null;
        
        // Restart after a delay if not manually stopped
        if (!isEndingSession && !isAISpeaking && !waitingForAI) {
          restartRecognitionTimeout.current = setTimeout(() => {
            startSpeechRecognition();
          }, 2000);
        }
      };

      recognition.onend = () => {
        addDebugMessage('🔄 Recognition ended');
        setRecognitionActive(false);
        setIsListening(false);
        recognitionRef.current = null;
        
        // Auto-restart if not manually stopped and AI is not busy
        if (!isEndingSession && !isAISpeaking && !waitingForAI && !isProcessingUserSpeech.current) {
          restartRecognitionTimeout.current = setTimeout(() => {
            startSpeechRecognition();
          }, 1000);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      
    } catch (error) {
      addDebugMessage(`❌ Failed to start recognition: ${error.message}`);
      setError(`Speech recognition failed: ${error.message}`);
    }
  };

  // Stop speech recognition
  const stopSpeechRecognition = () => {
    addDebugMessage('🛑 Stopping speech recognition');
    
    if (restartRecognitionTimeout.current) {
      clearTimeout(restartRecognitionTimeout.current);
      restartRecognitionTimeout.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (e) {
        addDebugMessage(`Error stopping recognition: ${e.message}`);
      }
    }
    
    setIsRecording(false);
    setRecognitionActive(false);
    setIsListening(false);
  };

  // Process user speech - SIMPLIFIED VERSION
  const processUserSpeech = async (speechText) => {
    addDebugMessage(`🎯 Processing: "${speechText}"`);
    
    // Basic validation
    if (!speechText || speechText.trim().length < 2) {
      addDebugMessage('🎯 Speech too short, ignoring');
      return;
    }
    
    // Prevent multiple simultaneous processing
    if (isProcessingUserSpeech.current) {
      addDebugMessage('🎯 Already processing speech, ignoring');
      return;
    }
    
    // Set processing state
    isProcessingUserSpeech.current = true;
    setWaitingForAI(true);
    setUserSpeechBuffer('');
    
    // Stop recognition while processing
    stopSpeechRecognition();
    
    try {
      // Add user message to conversation immediately
      const newUserMessage = {
        speaker: 'user',
        message: speechText,
        timestamp: Date.now()
      };
      
      setConversation(prev => [...prev, newUserMessage]);
      setTranscript(prev => prev + `[You]: ${speechText} `);
      
      addDebugMessage('🔄 Sending to backend...');
      const token = await user.getIdToken();
      
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/chat`,
        {
          sessionId: sessionId,
          userMessage: speechText,
          scenarioId: scenarioId,
          conversationHistory: [...conversation, newUserMessage]
        },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      const aiResponse = response.data?.response;
      const characterName = response.data?.character || 'Customer';
      
      if (aiResponse && aiResponse.trim()) {
        addDebugMessage(`✅ AI response: "${aiResponse.substring(0, 50)}..."`);
        
        // Add AI response to conversation
        const aiMessage = {
          speaker: 'ai',
          message: aiResponse,
          timestamp: Date.now()
        };
        
        setConversation(prev => [...prev, aiMessage]);
        setTranscript(prev => prev + `[${characterName}]: ${aiResponse} `);
        
        // Wait a moment then speak the response
        setTimeout(() => {
          speakText(aiResponse);
        }, 500);
        
      } else {
        addDebugMessage('⚠️ Empty AI response');
        setWaitingForAI(false);
        // Restart recognition immediately if no AI response
        setTimeout(() => startSpeechRecognition(), 1000);
      }
      
    } catch (error) {
      addDebugMessage(`❌ API error: ${error.message}`);
      setWaitingForAI(false);
      
      // Simple fallback
      const fallbackResponse = "Sorry, could you repeat that?";
      const aiMessage = {
        speaker: 'ai',
        message: fallbackResponse,
        timestamp: Date.now()
      };
      
      setConversation(prev => [...prev, aiMessage]);
      setTranscript(prev => prev + `[Customer]: ${fallbackResponse} `);
      
      setTimeout(() => {
        speakText(fallbackResponse);
      }, 500);
      
    } finally {
      isProcessingUserSpeech.current = false;
      setWaitingForAI(false);
    }
  };

  // Text to speech
  const speakText = (text) => {
    if (!('speechSynthesis' in window) || !text.trim()) {
      addDebugMessage('❌ Speech synthesis not available or empty text');
      setIsAISpeaking(false);
      // Restart recognition if speech synthesis fails
      setTimeout(() => startSpeechRecognition(), 1000);
      return;
    }

    addDebugMessage(`🔊 Starting TTS: ${text.substring(0, 30)}...`);
    
    setIsAISpeaking(true);
    
    // Cancel any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';
    
    // Auto-detect gender from character name
    const characterName = scenarioData?.ai_character_name || '';
    const firstName = characterName.split(' ')[0].toLowerCase();
    
    const femaleNames = ['sarah', 'jennifer', 'lisa', 'michelle', 'amy', 'angela', 'helen', 'rachel'];
    const maleNames = ['james', 'john', 'robert', 'michael', 'david', 'daniel', 'matthew', 'andrew'];
    
    const isFemale = femaleNames.includes(firstName) || !maleNames.includes(firstName);
    
    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      
      if (voices.length > 0) {
        let selectedVoice = null;
        
        if (isFemale) {
          selectedVoice = voices.find(voice => 
            voice.name.toLowerCase().includes('female') ||
            voice.name.toLowerCase().includes('zira') ||
            voice.name.toLowerCase().includes('samantha')
          );
        } else {
          selectedVoice = voices.find(voice => 
            voice.name.toLowerCase().includes('male') ||
            voice.name.toLowerCase().includes('david')
          );
        }
        
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => voice.lang.startsWith('en-'));
        }
        
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          addDebugMessage(`🔊 Selected voice: ${selectedVoice.name}`);
        }
      }
      
      utterance.onstart = () => {
        addDebugMessage('🔊 AI speech started');
        setIsAISpeaking(true);
      };
      
      utterance.onend = () => {
        addDebugMessage('🔊 AI speech ended');
        setIsAISpeaking(false);
        speechSynthesisRef.current = null;
        
        // Wait 2 seconds then restart recognition
        setTimeout(() => {
          if (!waitingForAI && !isProcessingUserSpeech.current && !isEndingSession) {
            addDebugMessage('🔊 Restarting recognition after speech');
            startSpeechRecognition();
          }
        }, 2000);
      };
      
      utterance.onerror = (event) => {
        addDebugMessage(`❌ Speech error: ${event.error}`);
        setIsAISpeaking(false);
        speechSynthesisRef.current = null;
        
        // Restart recognition even on error
        setTimeout(() => {
          if (!waitingForAI && !isProcessingUserSpeech.current && !isEndingSession) {
            startSpeechRecognition();
          }
        }, 2000);
      };
      
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };
    
    // Check if voices are loaded
    if (window.speechSynthesis.getVoices().length > 0) {
      setVoiceAndSpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        setVoiceAndSpeak();
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  };

  // Test microphone access
  const testMicrophone = async () => {
    try {
      addDebugMessage('Testing microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophonePermission('granted');
      addDebugMessage('✅ Microphone access granted');
      
      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());
      
      // Start speech recognition after successful test
      setTimeout(() => {
        startSpeechRecognition();
      }, 1000);
      
    } catch (error) {
      setMicrophonePermission('denied');
      addDebugMessage(`❌ Microphone error: ${error.message}`);
      setError(`Microphone access denied: ${error.message}`);
    }
  };

  // Initialize session
  const initializeSession = async () => {
    try {
      addDebugMessage('Initializing session...');
      
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch scenario details
      const scenarioResponse = await axios.get(
        `${API_BASE_URL}/api/scenarios`,
        { headers }
      );
      
      const currentScenario = scenarioResponse.data.find(s => 
        s.scenario_id === scenarioId || s.id === scenarioId
      );
      
      setScenarioData(currentScenario);
      addDebugMessage(`Scenario loaded: ${currentScenario?.title}`);

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
      addDebugMessage(`Session created: ${sessionResponse.data.sessionId}`);
      
      // Initialize Daily.co call
      const daily = DailyIframe.createCallObject({
        url: roomResponse.data.roomUrl
      });

      setCallObject(daily);
      
      daily.on('joined-meeting', () => {
        addDebugMessage('✅ Video call joined');
        setLoading(false);
        setSessionStartTime(Date.now());
        
        // Test microphone after joining
        testMicrophone();
      });

      daily.on('error', (error) => {
        addDebugMessage(`❌ Video call error: ${error.message}`);
        setError('Video call failed to start');
        setLoading(false);
      });

      await daily.join();

    } catch (error) {
      addDebugMessage(`❌ Session initialization error: ${error.message}`);
      setError('Failed to start session');
      setLoading(false);
    }
  };

  // Cleanup function
  const cleanup = () => {
    addDebugMessage('🧹 Starting cleanup...');
    
    // Clear timeouts
    if (restartRecognitionTimeout.current) {
      clearTimeout(restartRecognitionTimeout.current);
      restartRecognitionTimeout.current = null;
    }
    
    // Stop speech recognition
    stopSpeechRecognition();
    
    // Stop speech synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Destroy call object
    if (callObject) {
      try {
        callObject.destroy();
      } catch (e) {
        addDebugMessage(`Error destroying call: ${e.message}`);
      }
    }
    
    // Reset states
    setIsAISpeaking(false);
    setWaitingForAI(false);
    setIsListening(false);
    setUserSpeechBuffer('');
    isProcessingUserSpeech.current = false;
    
    addDebugMessage('🧹 Cleanup completed');
  };

  // End session
  const endSession = async () => {
    try {
      addDebugMessage('🔍 Ending session...');
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
      addDebugMessage(`❌ Error ending session: ${error.message}`);
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

  // Manual controls for testing
  const forceStartRecognition = () => {
    stopSpeechRecognition();
    setTimeout(() => startSpeechRecognition(), 500);
  };

  const processBufferedSpeech = () => {
    if (userSpeechBuffer.trim()) {
      processUserSpeech(userSpeechBuffer.trim());
    }
  };

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

  // Feedback state
  if (feedback) {
    return (
      <div className="feedback-container google-ads">
        <div className="feedback-card">
          <h2>🎯 Session Performance</h2>
          <p>Your {feedback?.skillArea || scenarioData?.sales_skill_area || 'sales'} practice session results:</p>
          
          <div className="google-ads-metrics">
            <div className="metric-category">
              <h3>Core Performance Metrics</h3>
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
                  <div className="score-circle">{feedback?.conversationLength || conversation.length}</div>
                  <p>Number of exchanges</p>
                </div>
              </div>
            </div>
          </div>

          {feedback?.aiFeedback && (
            <div className="ai-feedback-section google-ads">
              <h3>🎯 Coach Feedback</h3>
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

  // Active session state
  return (
    <div className="video-session">
      <div className="session-header google-ads">
        <div className="session-title">
          <h2>{scenarioData?.title || 'Practice Session'}</h2>
          <div className="session-context">
            <span className="skill-area">{scenarioData?.sales_skill_area || 'Sales Skills'}</span>
            <span className="buyer-persona">with {scenarioData?.buyer_persona || 'Customer'}</span>
            <span className="google-ads-focus">{scenarioData?.google_ads_focus || 'General'}</span>
          </div>
        </div>
        
        <div className="session-controls">
          <div className="ai-status">
            {waitingForAI && <span>🤖 {scenarioData?.ai_character_name || 'AI'} is thinking...</span>}
            {isAISpeaking && <span>🗣️ {scenarioData?.ai_character_name || 'AI'} is speaking...</span>}
            {isListening && !isAISpeaking && !waitingForAI && !userSpeechBuffer && (
              <span>🎤 Listening for your voice...</span>
            )}
            {userSpeechBuffer && !waitingForAI && (
              <span>📝 You're saying: "{userSpeechBuffer.substring(0, 40)}..."</span>
            )}
            {!isListening && !isAISpeaking && !waitingForAI && !userSpeechBuffer && (
              <span>⏸️ Ready (Mic: {microphonePermission})</span>
            )}
          </div>
          
          <div className="debug-controls">
            <button onClick={testMicrophone} className="process-speech-button">
              Test Mic
            </button>
            <button onClick={forceStartRecognition} className="clear-buffer-button">
              Restart Recognition
            </button>
            {userSpeechBuffer && (
              <button onClick={processBufferedSpeech} className="process-speech-button">
                Process Speech
              </button>
            )}
          </div>
          
          <button onClick={endSession} className="end-session-button">
            End Session
          </button>
        </div>
      </div>

      <div className="video-container" ref={callFrameRef}>
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
              {isListening && !isAISpeaking && !waitingForAI && (
                <div className="listening-indicator">Listening...</div>
              )}
              {!isListening && !isAISpeaking && !waitingForAI && (
                <div className="ready-indicator">Ready to talk</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="session-info">
        {userSpeechBuffer && (
          <div className="speech-buffer-section">
            <h4>🎤 Speaking:</h4>
            <div className="speech-buffer-box">
              {userSpeechBuffer}
            </div>
          </div>
        )}

        <div className="conversation-section">
          <h3>Conversation ({conversation.length} exchanges)</h3>
          <div className="conversation-box">
            {conversation.length === 0 ? (
              <div className="empty-conversation">
                <p>Your conversation will appear here...</p>
                <p><strong>Try saying:</strong> "Hello" or "Hi there"</p>
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

        <div className="debug-info">
          <details>
            <summary>🔍 Session Status & Debug</summary>
            <div className="debug-details">
              <p><strong>Character:</strong> {scenarioData?.ai_character_name || 'Loading...'}</p>
              <p><strong>Microphone:</strong> {microphonePermission}</p>
              <p><strong>Recording:</strong> {isRecording ? '✅ Active' : '❌ Inactive'}</p>
              <p><strong>Recognition Active:</strong> {recognitionActive ? '✅ Yes' : '❌ No'}</p>
              <p><strong>Listening:</strong> {isListening ? '✅ Active' : '❌ Inactive'}</p>
              <p><strong>AI Status:</strong> {
                isAISpeaking ? '🗣️
