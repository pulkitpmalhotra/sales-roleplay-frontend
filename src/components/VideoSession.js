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
  const [conversation, setConversation] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [waitingForAI, setWaitingForAI] = useState(false);
  
  const callFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const lastTranscriptLength = useRef(0);

  const API_BASE_URL = 'https://sales-roleplay-backend-production-468a.up.railway.app';

  useEffect(() => {
    initializeSession();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (callObject) {
      callObject.destroy();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (speechSynthesisRef.current) {
      window.speechSynthesis.cancel();
    }
  };

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
  try {
    setLoading(true);
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

    setFeedback(response.data.analysis);
    setLoading(false);

    // Fallback: if feedback doesn't show after 5 seconds, go to dashboard
    setTimeout(() => {
      if (!feedback) {
        console.log('⚠️ Feedback not showing, redirecting to dashboard');
        navigate('/dashboard');
      }
    }, 5000);

  } catch (error) {
    console.error('Error ending session:', error);
    
    // If session ending fails, just go back to dashboard
    setTimeout(() => {
      navigate('/dashboard');
    }, 2000);
  }
};

  // ... (keep your existing loading, error, and feedback JSX the same)

  return (
    <div className="video-session">
      <div className="session-header">
        <h2>Roleplay with Sarah Mitchell - IT Director</h2>
        <div className="session-controls">
          <div className="ai-status">
            {waitingForAI && <span>🤖 AI is thinking...</span>}
            {isAISpeaking && <span>🗣️ Sarah is speaking...</span>}
            {isRecording && !isAISpeaking && <span>🎤 Listening...</span>}
          </div>
          <button onClick={endSession} className="end-session-button">
            End Session
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
