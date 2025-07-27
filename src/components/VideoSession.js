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
  const [isListening, setIsListening] = useState(false);
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState('unknown');
  const [debugInfo, setDebugInfo] = useState([]);
  
  // Refs
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const speechTimeoutRef = useRef(null);
  const isProcessingUserSpeech = useRef(false);
  const listeningTimeoutRef = useRef(null);
  const lastAISpeechTime = useRef(0);

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

  // Completely stop speech recognition
  const stopSpeechRecognition = () => {
    addDebugMessage('🛑 Stopping speech recognition');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsRecording(false);
        setRecognitionActive(false);
        setIsListening(false);
        addDebugMessage('🛑 Speech recognition stopped');
      } catch (e) {
        addDebugMessage(`🛑 Error stopping recognition: ${e.message}`);
      }
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
      
      // Try to start speech recognition
      forceStartRecognition();
    } catch (error) {
      setMicrophonePermission('denied');
      addDebugMessage(`❌ Microphone error: ${error.message}`);
      setError(`Microphone access denied: ${error.message}`);
    }
  };

  // Force start recognition for testing
  const forceStartRecognition = () => {
    addDebugMessage('Force starting speech recognition...');
    
    if (!('webkitSpeechRecognition' in window)) {
      addDebugMessage('❌ Speech recognition not supported');
      setError('Speech recognition not supported. Please use Chrome browser.');
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      stopSpeechRecognition();
    }

    try {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        addDebugMessage('✅ Speech recognition started');
        setIsRecording(true);
        setRecognitionActive(true);
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        addDebugMessage(`🎤 Speech detected - ${event.results.length} results`);
        
        // Skip if AI is busy
        if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current) {
          addDebugMessage('🎤 BLOCKED - AI is busy');
          return;
        }

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          const confidence = result[0].confidence || 0.5;
          const isFinal = result.isFinal;
          
          addDebugMessage(`Result: "${transcript}" (conf: ${confidence.toFixed(2)}, final: ${isFinal})`);
          
          if (isFinal && transcript.trim().length > 2) {
            addDebugMessage(`✅ Processing: "${transcript}"`);
            processUserSpeechRealtime(transcript.trim());
          } else if (!isFinal && transcript.trim().length > 1) {
            setUserSpeechBuffer(transcript.trim());
          }
        }
      };

      recognition.onerror = (event) => {
        addDebugMessage(`❌ Recognition error: ${event.error}`);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access.');
          setMicrophonePermission('denied');
        }
      };

      recognition.onend = () => {
        addDebugMessage('🔄 Recognition ended, restarting...');
        setRecognitionActive(false);
        
        // Auto-restart if not manually stopped
        if (recognitionRef.current && !isEndingSession && !error && !isAISpeaking) {
          setTimeout(() => {
            if (!isAISpeaking && !waitingForAI) {
              forceStartRecognition();
            }
          }, 1000);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      addDebugMessage('🎤 Recognition instance created and started');
      
    } catch (error) {
      addDebugMessage(`❌ Failed to start recognition: ${error.message}`);
      setError(`Speech recognition failed: ${error.message}`);
    }
  };

  // Cleanup function with complete speech recognition shutdown
  const cleanup = () => {
    addDebugMessage('🧹 Starting cleanup...');
    
    // Clear any timeouts
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }
    
    // Stop Daily.co call
    if (callObject) {
      try {
        callObject.destroy();
      } catch (e) {
        addDebugMessage(`Error destroying call object: ${e.message}`);
      }
      setCallObject(null);
    }
    
    // Completely stop speech recognition
    stopSpeechRecognition();
    
    // Stop speech synthesis completely
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.pause();
      } catch (e) {
        addDebugMessage(`Error stopping speech synthesis: ${e.message}`);
      }
    }
    
    // Clear speech synthesis ref
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current = null;
    }
    
    // Reset all AI states
    setIsAISpeaking(false);
    setWaitingForAI(false);
    setIsListening(false);
    setUserSpeechBuffer('');
    isProcessingUserSpeech.current = false;
    lastAISpeechTime.current = 0;
    
    addDebugMessage('🧹 Cleanup completed');
  };

  // Initialize session with microphone test
  const initializeSession = async () => {
    try {
      addDebugMessage('Initializing session...');
      
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
      
      // Set up call event listeners
      daily.on('joined-meeting', () => {
        addDebugMessage('✅ Video call joined successfully');
        setLoading(false);
        setSessionStartTime(Date.now());
        
        // Test microphone immediately
        testMicrophone();
      });

      daily.on('error', (error) => {
        addDebugMessage(`❌ Video call error: ${error.message}`);
        setError('Video call failed to start');
        setLoading(false);
      });

      // Join the call
      await daily.join();

    } catch (error) {
      addDebugMessage(`❌ Session initialization error: ${error.message}`);
      setError('Failed to start session');
      setLoading(false);
    }
  };

  // Simplified speech processing with reasonable validation
  const processUserSpeechRealtime = async (speechText) => {
    addDebugMessage(`🎯 Processing speech: "${speechText}"`);
    
    // Basic validation - not too strict
    if (!speechText || speechText.trim().length < 2) {
      addDebugMessage('🎯 Speech too short, ignoring');
      setIsListening(true);
      return;
    }
    
    // CRITICAL: Double-check AI is not busy before processing
    if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current) {
      addDebugMessage('🎯 BLOCKED - AI is busy, aborting speech processing');
      setIsListening(true);
      return;
    }
    
    // Check speech synthesis state
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      addDebugMessage('🎯 BLOCKED - Speech synthesis active, aborting processing');
      setIsListening(true);
      return;
    }

    // Set processing state
    isProcessingUserSpeech.current = true;
    setIsListening(false);
    setUserSpeechBuffer('');
    setWaitingForAI(true);
    addDebugMessage('🎯 Starting AI processing...');

    try {
      // Add user message to conversation first
      const newUserMessage = {
        speaker: 'user',
        message: speechText,
        timestamp: Date.now()
      };
      
      // Update conversation state
      setConversation(prev => [...prev, newUserMessage]);
      setTranscript(prev => prev + `[You]: ${speechText} `);
      
      // Create updated conversation history for API call
      const updatedConversationHistory = [...conversation, newUserMessage];
      
      addDebugMessage('🔄 Sending to backend API...');
      const token = await user.getIdToken();
      
      const requestData = {
        sessionId: sessionId,
        userMessage: speechText,
        scenarioId: scenarioId,
        conversationHistory: updatedConversationHistory
      };
      
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/chat`,
        requestData,
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      addDebugMessage('✅ Backend response received');
      
      const aiResponse = response.data?.response;
      const characterName = response.data?.character || 'Customer';
      
      if (aiResponse && aiResponse.trim()) {
        addDebugMessage(`✅ AI response: "${aiResponse.substring(0, 50)}..."`);
        
        addToConversation('ai', aiResponse);
        setTranscript(prev => prev + `[${characterName}]: ${aiResponse} `);
        setWaitingForAI(false);
        
        // Text-to-speech
        setTimeout(() => {
          speakText(aiResponse);
        }, 300);
        
      } else {
        addDebugMessage('❌ Empty AI response, returning to listening');
        setWaitingForAI(false);
        setIsListening(true);
      }
      
    } catch (error) {
      addDebugMessage(`❌ API error: ${error.message}`);
      setWaitingForAI(false);
      
      // Simple fallback
      const fallbackResponse = "Sorry, could you repeat that?";
      addToConversation('ai', fallbackResponse);
      setTranscript(prev => prev + `[Customer]: ${fallbackResponse} `);
      
      setTimeout(() => {
        speakText(fallbackResponse);
      }, 300);
      
    } finally {
      isProcessingUserSpeech.current = false;
      addDebugMessage('🎯 Speech processing completed');
    }
  };

  // Add to conversation with duplicate prevention
  const addToConversation = (speaker, message) => {
    addDebugMessage(`💬 Adding ${speaker} message: ${message.substring(0, 30)}...`);
    
    setConversation(prev => {
      // Prevent exact duplicates
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && 
          lastMessage.speaker === speaker && 
          lastMessage.message === message) {
        addDebugMessage('🚫 Duplicate message prevented');
        return prev;
      }
      
      return [...prev, {
        speaker,
        message,
        timestamp: Date.now()
      }];
    });
  };

  // Enhanced text to speech with automatic gender detection from name
  const speakText = (text) => {
    if ('speechSynthesis' in window && text.trim()) {
      addDebugMessage(`🔊 Starting TTS: ${text.substring(0, 30)}...`);
      
      const characterName = scenarioData?.ai_character_name || '';
      setIsAISpeaking(true);
      lastAISpeechTime.current = Date.now();
      
      // Stop speech recognition while AI speaks
      stopSpeechRecognition();
      
      // Cancel any existing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Enhanced voice settings
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';
      
      // Auto-detect gender from character name
      const detectGenderFromName = (name) => {
        if (!name) return 'female';
        
        const firstName = name.split(' ')[0].toLowerCase();
        
        const femaleNames = [
          'sarah', 'jennifer', 'lisa', 'michelle', 'kimberly', 'amy', 'angela', 'helen', 'deborah', 'rachel',
          'carolyn', 'janet', 'virginia', 'maria', 'heather', 'diane', 'julie', 'joyce', 'victoria', 'kelly'
        ];
        
        const maleNames = [
          'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'christopher',
          'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua'
        ];
        
        if (femaleNames.includes(firstName)) {
          return 'female';
        } else if (maleNames.includes(firstName)) {
          return 'male';
        }
        
        return 'female';
      };
      
      const detectedGender = detectGenderFromName(characterName);
      
      // Gender-aware voice selection
      const setVoiceAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        
        if (voices.length > 0) {
          let selectedVoice = null;
          
          if (detectedGender === 'female') {
            const femaleVoiceNames = [
              'Microsoft Zira - English (United States)',
              'Google US English Female',
              'Samantha',
              'Karen'
            ];
            
            for (const voiceName of femaleVoiceNames) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes(voiceName.toLowerCase())
              );
              if (selectedVoice) break;
            }
            
            if (!selectedVoice) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('zira') ||
                voice.name.toLowerCase().includes('samantha')
              );
            }
          } else {
            const maleVoiceNames = [
              'Microsoft David - English (United States)',
              'Google US English Male',
              'Daniel',
              'Tom'
            ];
            
            for (const voiceName of maleVoiceNames) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes(voiceName.toLowerCase())
              );
              if (selectedVoice) break;
            }
            
            if (!selectedVoice) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('male') ||
                voice.name.toLowerCase().includes('david')
              );
            }
          }
          
          if (!selectedVoice) {
            selectedVoice = voices.find(voice => voice.lang.startsWith('en-'));
          }
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            addDebugMessage(`🔊 Selected voice: ${selectedVoice.name}`);
          }
        }
        
        // Event listeners with COMPLETE speech recognition shutdown
        utterance.onstart = () => {
          addDebugMessage('🔊 AI speech started - recognition stopped');
          setIsAISpeaking(true);
          setIsListening(false);
        };
        
        utterance.onend = () => {
          addDebugMessage('🔊 AI speech ended - waiting 3s before restart');
          setIsAISpeaking(false);
          speechSynthesisRef.current = null;
          lastAISpeechTime.current = Date.now();
          
          // Wait 3 seconds before restarting recognition
          setTimeout(() => {
            if (!waitingForAI && !isProcessingUserSpeech.current && !isAISpeaking) {
              addDebugMessage('🔊 Restarting recognition after AI speech');
              forceStartRecognition();
            }
          }, 3000);
        };
        
        utterance.onerror = (event) => {
          addDebugMessage(`❌ Speech error: ${event.error}`);
          setIsAISpeaking(false);
          speechSynthesisRef.current = null;
          lastAISpeechTime.current = Date.now();
          
          setTimeout(() => {
            if (!waitingForAI && !isProcessingUserSpeech.current && !isAISpeaking) {
              forceStartRecognition();
            }
          }, 3000);
        };
        
        // Speak the text
        speechSynthesisRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      };
      
      // Check if voices are already loaded
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoiceAndSpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          setVoiceAndSpeak();
          window.speechSynthesis.onvoiceschanged = null;
        };
      }
    } else {
      addDebugMessage('❌ Speech synthesis not supported or empty text');
      setIsAISpeaking(false);
    }
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
            
            {/* Sales Skills Breakdown */}
            <div className="metric-category">
              <h3>Sales Skills Assessment</h3>
              <div className="metrics-grid">
                <div className="metric">
                  <h4>Discovery</h4>
                  <div className="score-circle">{feedback?.discovery_score || 'N/A'}/5</div>
                  <p>Questions and needs analysis</p>
                </div>
                
                <div className="metric">
                  <h4>Product Knowledge</h4>
                  <div className="score-circle">{feedback?.product_knowledge_score || 'N/A'}/5</div>
                  <p>Technical concepts used</p>
                </div>
                
                <div className="metric">
                  <h4>Objection Handling</h4>
                  <div className="score-circle">{feedback?.objection_handling_score || 'N/A'}/5</div>
                  <p>Addressing concerns</p>
                </div>
                
                <div className="metric">
                  <h4>Business Value</h4>
                  <div className="score-circle">{feedback?.business_value_score || 'N/A'}/5</div>
                  <p>ROI and benefits focus</p>
                </div>
              </div>
            </div>
            
            {/* Overall Effectiveness */}
            <div className="metric-category">
              <h3>Overall Assessment</h3>
              <div className="overall-score">
                <div className="large-score">
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
        {/* Real-time Speech Feedback */}
        {userSpeechBuffer && (
          <div className="speech-buffer-section">
            <h4>🎤 Speaking:</h4>
            <div className="speech-buffer-box">
              {userSpeechBuffer}
            </div>
          </div>
        )}

        {/* Live Conversation Display */}
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

        {/* Full Transcript Display */}
        {transcript && (
          <div className="transcript-section">
            <h4>📝 Transcript ({transcript.split(' ').filter(w => w.length > 0).length} words)</h4>
            <div className="transcript-box">
              {transcript || 'Transcript will appear here...'}
            </div>
          </div>
        )}

        {/* Session Status with Debug Info */}
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
                isAISpeaking ? '🗣️ Speaking' : 
                waitingForAI ? '🤖 Thinking' : 
                isListening ? '👂 Listening' :
                '⏸️ Ready'
              }</p>
              <p><strong>Speech Buffer:</strong> {userSpeechBuffer || 'Empty'}</p>
              <p><strong>Exchanges:</strong> {conversation.length}</p>
              <p><strong>Browser:</strong> {navigator.userAgent.includes('Chrome') ? 'Chrome ✅' : 'Other ⚠️'}</p>
              
              <div style={{marginTop: '10px'}}>
                <strong>Debug Log:</strong>
                {debugInfo.map((msg, i) => (
                  <div key={i} style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default VideoSession;feedback?.overall_effectiveness_score || 'N/A'}/5
                </div>
                <p>Overall Sales Effectiveness</p>
              </div>
            </div>
            
            {/* Concepts Used */}
            {feedback?.google_ads_concepts_used && feedback.google_ads_concepts_used.length > 0 && (
              <div className="google-ads-concepts">
                <h4>Concepts Demonstrated</h4>
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

  // Active session state with AI avatar
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
              Test Microphone
            </button>
            <button onClick={forceStartRecognition} className="clear-buffer-button">
              Start Recognition
            </button>
          </div>
          
          <button onClick={endSession} className="end-session-button">
            End Session
          </button>
        </div>
      </div>

      <div className="video-container" ref={callFrameRef}>
        {/* AI Avatar Overlay */}
        <div className="ai-avatar-overlay">
          <div className={`ai-avatar ${isAISpeaking ? 'speaking' : ''} ${waitingForAI ? 'thinking' : ''}`}>
            <div className="avatar-image">
              <div className="avatar-placeholder">
                {
