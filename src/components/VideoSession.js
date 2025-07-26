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
      app.post('/api/sessions/start', authenticateToken, async (req, res) => {
  try {
    const { scenarioId, roomUrl } = req.body;
    
    const sessionId = `session_${Date.now()}_${req.user.uid}`;
    console.log('🔍 Creating session:', sessionId);
    
    const sessionsSheet = doc.sheetsByTitle['Sessions'];
    const session = await sessionsSheet.addRow({
      id: sessionId,
      userId: req.user.uid,
      scenarioId: scenarioId,
      roomUrl: roomUrl,
      startTime: new Date().toISOString(),
      status: 'active'
    });
    
    console.log('✅ Session created:', sessionId);
    
    res.json({
      sessionId: sessionId,
      status: 'started'
    });
  } catch (error) {
    console.error('❌ Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});
      
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
      setIsAISpeaking(true);
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      
      // Try to use a female voice
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

  // End session
const endSession = async () => {
  try {
    setIsEndingSession(true);
    cleanup();

    const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;

    console.log('🔍 Ending session with data:', {
      sessionId,
      duration,
      conversationLength: conversation.length
    });

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

    console.log('✅ Full backend response:', response);
    console.log('✅ Response data:', response.data);
    console.log('✅ Analysis object:', response.data.analysis);

    if (response.data && response.data.analysis) {
      setFeedback(response.data.analysis);
      console.log('✅ Feedback state set successfully');
    } else {
      console.error('❌ No analysis in response');
      // Fallback - go to dashboard if no feedback
      setTimeout(() => navigate('/dashboard'), 2000);
    }
    
    setIsEndingSession(false);

  } catch (error) {
    console.error('❌ Error ending session:', error);
    console.error('❌ Error response:', error.response?.data);
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
app.post('/api/sessions/end', authenticateToken, async (req, res) => {
  try {
    const { sessionId, transcript, duration, conversationHistory = [] } = req.body;
    
    console.log('🔍 Ending session:', sessionId, 'for user:', req.user.uid);
    console.log('🔍 Session data:', { duration, conversationLength: conversationHistory.length });
    
    // Redact PII from transcript
    const redactedTranscript = redactPII(transcript || '');
    
    // Basic analysis
    function analyzeSession(transcript, conversationHistory = []) {
  console.log('🔍 Analyzing session with conversation length:', conversationHistory.length);
  
  if (!transcript && conversationHistory.length === 0) {
    return {
      talkTimeRatio: 50,
      fillerWordCount: 0,
      confidenceScore: 50,
      wordCount: 0,
      averageSentenceLength: 0,
      conversationLength: 0
    };
  }
  
  // Use conversation history if available, fallback to transcript
  let textToAnalyze = transcript;
  if (conversationHistory.length > 0) {
    textToAnalyze = conversationHistory
      .filter(msg => msg.speaker === 'user')
      .map(msg => msg.message)
      .join(' ');
  }
  
  const words = textToAnalyze.toLowerCase().split(/\s+/).filter(word => word.length > 0);
  const sentences = textToAnalyze.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Count filler words
  const fillerWords = ['um', 'uh', 'like', 'you know', 'basically', 'literally', 'actually'];
  const fillerWordCount = words.filter(word => 
    fillerWords.some(filler => word.includes(filler))
  ).length;
  
  // Calculate confidence score (inverse relationship with filler words)
  const fillerRatio = words.length > 0 ? fillerWordCount / words.length : 0;
  const confidenceScore = Math.max(20, Math.min(100, 100 - (fillerRatio * 200)));
  
  // Calculate average sentence length
  const averageSentenceLength = sentences.length > 0 ? 
    words.length / sentences.length : 0;
  
  // Estimate talk time based on conversation balance
  const userMessages = conversationHistory.filter(msg => msg.speaker === 'user').length;
  const totalMessages = conversationHistory.length;
  const estimatedTalkTime = totalMessages > 0 ? 
    Math.round((userMessages / totalMessages) * 100) : 50;
  
  return {
    talkTimeRatio: estimatedTalkTime,
    fillerWordCount: fillerWordCount,
    confidenceScore: Math.round(confidenceScore),
    wordCount: words.length,
    averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
    conversationLength: conversationHistory.length
  };
}
    
    // Get AI feedback
    let aiFeedback = '';
    try {
      const conversationText = conversationHistory
        .map(msg => `${msg.speaker === 'user' ? 'Salesperson' : 'Customer'}: ${msg.message}`)
        .join('\n');
      
      if (conversationText.length > 0) {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{
            role: "system",
            content: "You are a sales coach. Analyze this sales roleplay conversation and provide constructive feedback on communication skills, persuasion techniques, and areas for improvement. Keep it concise and actionable."
          }, {
            role: "user",
            content: `Please analyze this sales conversation:\n\n${conversationText.substring(0, 2000)}`
          }],
          max_tokens: 300
        });
        
        aiFeedback = completion.choices[0].message.content;
      } else {
        aiFeedback = "Great job starting the conversation! Try to engage more with the customer to get detailed feedback.";
      }
    } catch (error) {
      console.error('OpenAI API error:', error);
      aiFeedback = 'Session completed successfully. Keep practicing to improve your skills!';
    }
    
    // Update session in Google Sheets
    try {
      const sessionsSheet = doc.sheetsByTitle['Sessions'];
      const rows = await sessionsSheet.getRows();
      const session = rows.find(row => row.get('id') === sessionId);
      
      if (session) {
        session.set('endTime', new Date().toISOString());
        session.set('duration', duration);
        session.set('status', 'completed');
        session.set('transcript', redactedTranscript);
        await session.save();
        console.log('✅ Session updated in sheets');
      } else {
        console.log('⚠️ Session not found in sheets:', sessionId);
      }
    } catch (sheetError) {
      console.error('❌ Error updating session in sheets:', sheetError);
    }
    
    // Save feedback
    try {
      const feedbackSheet = doc.sheetsByTitle['Feedback'];
      await feedbackSheet.addRow({
        sessionId: sessionId,
        userId: req.user.uid,
        createdAt: new Date().toISOString(),
        talkTimeRatio: analysis.talkTimeRatio,
        fillerWordCount: analysis.fillerWordCount,
        confidenceScore: analysis.confidenceScore,
        aiFeedback: aiFeedback,
        conversationLength: conversationHistory.length,
        keyMetrics: JSON.stringify(analysis)
      });
      console.log('✅ Feedback saved to sheets');
    } catch (feedbackError) {
      console.error('❌ Error saving feedback:', feedbackError);
    }
    
    const finalAnalysis = {
      ...analysis,
      aiFeedback: aiFeedback,
      conversationLength: conversationHistory.length
    };
    
    console.log('✅ Sending final analysis:', finalAnalysis);
    
    res.json({
      analysis: finalAnalysis
    });
    
  } catch (error) {
    console.error('❌ Error ending session:', error);
    res.status(500).json({ 
      error: 'Failed to end session', 
      details: error.message 
    });
  }
});
  // Loading state
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
