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
        
        // Session ready - waiting for user to start conversation
        console.log('✅ Session ready - waiting for user to start conversation');
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

  // Speech recognition with simplified, reliable flow
  const startSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('🎤 Speech recognition started successfully');
        setIsRecording(true);
      };

      recognition.onresult = (event) => {
        // Skip if AI is busy
        if (isAISpeaking || waitingForAI || isProcessingUserSpeech.current) {
          console.log('🎤 Skipping - AI is busy');
          return;
        }

        let finalTranscript = '';
        
        // Get only final results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript.trim() && finalTranscript.length > 2) {
          console.log('🎤 Final speech detected:', finalTranscript);
          
          // Clear any existing timeout
          if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
          }
          
          // Process immediately for responsive conversation
          processUserSpeechRealtime(finalTranscript.trim());
        }
      };

      recognition.onerror = (event) => {
        console.log('🎤 Speech error:', event.error);
        
        // Only show error for serious issues
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access and refresh.');
        } else if (event.error === 'audio-capture') {
          setError('Microphone not accessible. Please check your microphone.');
        }
        // Ignore other errors like 'no-speech'
      };

      recognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        
        // Restart recognition unless manually stopped
        if (recognitionRef.current && !isEndingSession && !error) {
          setTimeout(() => {
            if (recognitionRef.current && !isEndingSession) {
              try {
                recognition.start();
              } catch (e) {
                console.log('🎤 Restart failed, retrying...');
                setTimeout(() => {
                  if (recognitionRef.current) {
                    try {
                      recognition.start();
                    } catch (e2) {
                      console.error('🎤 Failed to restart recognition');
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
        console.log('🎤 Speech recognition initialized');
      } catch (e) {
        console.error('❌ Failed to start speech recognition:', e);
        setError('Speech recognition failed to start. Please refresh and try again.');
      }
    } else {
      setError('Speech recognition not supported. Please use Chrome browser.');
    }
  };

  // Simplified speech processing with conversation history
  const processUserSpeechRealtime = async (speechText) => {
    console.log('🎯 PROCESSING USER SPEECH:', speechText);
    console.log('🎯 Current conversation length:', conversation.length);
    
    // Validation
    if (!speechText || speechText.length < 2) {
      console.log('🎯 Speech too short, ignoring');
      return;
    }
    
    if (isProcessingUserSpeech.current) {
      console.log('🎯 Already processing speech, ignoring');
      return;
    }

    // Set processing state
    isProcessingUserSpeech.current = true;
    setUserSpeechBuffer('');
    setWaitingForAI(true);

    try {
      console.log('🎯 Adding user message to conversation');
      
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
      
      console.log('🔄 Sending to backend API with conversation history...');
      const token = await user.getIdToken();
      
      const requestData = {
        sessionId: sessionId,
        userMessage: speechText,
        scenarioId: scenarioId,
        conversationHistory: updatedConversationHistory // Send the updated history
      };
      
      console.log('🔄 Request data:', {
        ...requestData,
        conversationHistory: requestData.conversationHistory.map(msg => ({
          speaker: msg.speaker,
          message: msg.message.substring(0, 30) + '...'
        }))
      });
      
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
      
      console.log('✅ Backend response:', response.data);
      
      const aiResponse = response.data?.response;
      const characterName = response.data?.character || 'Customer';
      
      if (aiResponse && aiResponse.trim()) {
        console.log('✅ Valid AI response received:', aiResponse);
        
        addToConversation('ai', aiResponse);
        setTranscript(prev => prev + `[${characterName}]: ${aiResponse} `);
        setWaitingForAI(false);
        
        // Text-to-speech
        setTimeout(() => {
          speakText(aiResponse);
        }, 300);
        
      } else {
        console.error('❌ Empty or invalid AI response');
        throw new Error('Invalid AI response');
      }
      
    } catch (error) {
      console.error('❌ Speech processing error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      setWaitingForAI(false);
      
      // Simple fallback
      const fallbackResponse = "Could you say that again? I want to make sure I understand.";
      addToConversation('ai', fallbackResponse);
      setTranscript(prev => prev + `[Customer]: ${fallbackResponse} `);
      
      setTimeout(() => {
        speakText(fallbackResponse);
      }, 300);
      
    } finally {
      isProcessingUserSpeech.current = false;
      console.log('🎯 Speech processing completed');
    }
  };

  // Add to conversation with duplicate prevention
  const addToConversation = (speaker, message) => {
    console.log(`💬 Adding ${speaker} message:`, message.substring(0, 50) + '...');
    
    setConversation(prev => {
      // Prevent exact duplicates
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && 
          lastMessage.speaker === speaker && 
          lastMessage.message === message) {
        console.log('🚫 Duplicate message prevented');
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
      console.log('🔊 Starting speech synthesis for:', text.substring(0, 50) + '...');
      
      const characterName = scenarioData?.ai_character_name || '';
      console.log('🔊 Character name:', characterName);
      setIsAISpeaking(true);
      
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
        if (!name) return 'female'; // Default fallback
        
        const firstName = name.split(' ')[0].toLowerCase();
        
        // Common female names
        const femaleNames = [
          'sarah', 'jennifer', 'lisa', 'michelle', 'kimberly', 'amy', 'angela', 'helen', 'deborah', 'rachel',
          'carolyn', 'janet', 'virginia', 'maria', 'heather', 'diane', 'julie', 'joyce', 'victoria', 'kelly',
          'christina', 'joan', 'evelyn', 'judith', 'andrea', 'hannah', 'jacqueline', 'martha', 'gloria', 'sara',
          'janice', 'julia', 'kathryn', 'sophia', 'frances', 'alice', 'marie', 'jean', 'janet', 'catherine',
          'ann', 'anna', 'margaret', 'nancy', 'betty', 'dorothy', 'sandra', 'ashley', 'donna', 'carol',
          'ruth', 'sharon', 'laura', 'cynthia', 'kathleen', 'helen', 'amy', 'shirley', 'brenda', 'emma',
          'olivia', 'elizabeth', 'emily', 'madison', 'ava', 'mia', 'abigail', 'ella', 'chloe', 'natalie',
          'samantha', 'grace', 'sophia', 'isabella', 'zoe', 'lily', 'hannah', 'layla', 'brooklyn', 'alexis'
        ];
        
        // Common male names
        const maleNames = [
          'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'christopher',
          'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
          'kenneth', 'kevin', 'brian', 'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan',
          'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
          'benjamin', 'samuel', 'gregory', 'alexander', 'patrick', 'frank', 'raymond', 'jack', 'dennis', 'jerry',
          'tyler', 'aaron', 'jose', 'henry', 'adam', 'douglas', 'nathan', 'peter', 'zachary', 'kyle',
          'noah', 'william', 'mason', 'liam', 'lucas', 'ethan', 'oliver', 'aiden', 'elijah', 'james',
          'jackson', 'logan', 'alexander', 'caleb', 'ryan', 'luke', 'daniel', 'jack', 'connor', 'owen'
        ];
        
        if (femaleNames.includes(firstName)) {
          return 'female';
        } else if (maleNames.includes(firstName)) {
          return 'male';
        }
        
        // Default to female if name not found
        return 'female';
      };
      
      const detectedGender = detectGenderFromName(characterName);
      console.log('🔊 Detected gender from name:', detectedGender);
      
      // Gender-aware voice selection
      const setVoiceAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log('🔊 Available voices:', voices.length);
        
        if (voices.length === 0) {
          console.log('⚠️ No voices available yet, speaking with default');
        } else {
          let selectedVoice = null;
          
          if (detectedGender === 'female') {
            // Priority order for female voices
            const femaleVoiceNames = [
              'Microsoft Zira - English (United States)',
              'Google US English Female',
              'Samantha',
              'Karen',
              'Moira', 
              'Tessa',
              'Veena',
              'Alex (Premium)',
              'Fiona'
            ];
            
            // Try to find preferred female voices
            for (const voiceName of femaleVoiceNames) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes(voiceName.toLowerCase())
              );
              if (selectedVoice) break;
            }
            
            // Fallback: find any female voice by keywords
            if (!selectedVoice) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('woman') ||
                voice.name.toLowerCase().includes('zira') ||
                voice.name.toLowerCase().includes('samantha') ||
                voice.name.toLowerCase().includes('karen') ||
                (voice.gender && voice.gender.toLowerCase() === 'female')
              );
            }
          } else if (detectedGender === 'male') {
            // Priority order for male voices  
            const maleVoiceNames = [
              'Microsoft David - English (United States)',
              'Google US English Male',
              'Daniel',
              'Tom',
              'Fred',
              'Ralph',
              'Alex'
            ];
            
            // Try to find preferred male voices
            for (const voiceName of maleVoiceNames) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes(voiceName.toLowerCase())
              );
              if (selectedVoice) break;
            }
            
            // Fallback: find any male voice by keywords
            if (!selectedVoice) {
              selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('male') ||
                voice.name.toLowerCase().includes('man') ||
                voice.name.toLowerCase().includes('david') ||
                voice.name.toLowerCase().includes('daniel') ||
                voice.name.toLowerCase().includes('tom') ||
                (voice.gender && voice.gender.toLowerCase() === 'male')
              );
            }
          }
          
          // Final fallback: use first English voice
          if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
              voice.lang.startsWith('en-')
            );
          }
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log('🔊 Selected voice:', selectedVoice.name, 'for detected gender:', detectedGender);
          } else {
            console.log('⚠️ Using default voice for detected gender:', detectedGender);
          }
        }
        
        // Event listeners for debugging
        utterance.onstart = () => {
          console.log('🔊 Speech started with voice:', utterance.voice?.name || 'default');
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
        console.log('🔊 About to speak with voice:', utterance.voice?.name || 'default');
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
      console.error('❌ Speech synthesis not supported or empty text');
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
                  {feedback?.overall_effectiveness_score || 'N/A'}/5
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
