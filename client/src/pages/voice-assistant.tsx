import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mic, MicOff, Cloud, Menu, Bot, CloudSun, Newspaper, Bell, Music, Play, Pause, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { VoiceVisualizer } from '@/components/voice-visualizer';
import { ConversationSidebar } from '@/components/conversation-sidebar';
import { SettingsModal } from '@/components/settings-modal';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';
import { useWakeWord } from '@/hooks/use-wake-word';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import type { Message, Conversation } from '@shared/schema';

interface VoiceProcessingResponse {
  transcription: string;
  response: string;
  action?: string;
  data?: any;
}

export default function VoiceAssistant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("Say 'Jarvis' or click to start");
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [currentMusicUrl, setCurrentMusicUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Audio hooks
  const audioRecorder = useAudioRecorder();
  const speechSynthesis = useSpeechSynthesis();
  const speechRecognition = useSpeechRecognition();
  
  // Wake word detection
  const wakeWord = useWakeWord(
    () => {
      handleMicrophoneToggle();
      setStatusText("Wake word detected! Listening...");
    },
    ['jarvis', 'computer', 'assistant']
  );
  
  // Refs
  const responseAreaRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Update text input with real-time transcript
  useEffect(() => {
    if (textInputRef.current) {
      if (speechRecognition.isListening) {
        textInputRef.current.value = speechRecognition.transcript || "Listening...";
      } else if (!speechRecognition.transcript) {
        textInputRef.current.value = "";
      }
    }
  }, [speechRecognition.transcript, speechRecognition.isListening]);

  // Queries
  const { data: currentConversation } = useQuery<Conversation>({
    queryKey: ['/api/conversations', currentConversationId],
    enabled: !!currentConversationId,
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ['/api/conversations', currentConversationId, 'messages'],
    enabled: !!currentConversationId,
  });

  // Enhanced voice processing mutation with speech recognition fallback
  const processVoiceMutation = useMutation({
    mutationFn: async (data: { audioBlob?: Blob; transcriptionText?: string }) => {
      const formData = new FormData();
      
      if (data.audioBlob) {
        formData.append('audio', data.audioBlob, 'recording.webm');
      }
      
      if (data.transcriptionText) {
        formData.append('transcriptionText', data.transcriptionText);
      }
      
      if (currentConversationId) {
        formData.append('conversationId', currentConversationId);
      }

      const response = await fetch('/api/process-voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.useClientSideTranscription) {
          throw new Error('USE_CLIENT_SIDE_TRANSCRIPTION');
        }
        throw new Error(`Voice processing failed: ${response.statusText}`);
      }

      return response.json() as Promise<VoiceProcessingResponse>;
    },
    onSuccess: async (data) => {
      setStatusText("Processing complete");
      
      // Create conversation if none exists
      if (!currentConversationId) {
        const newConversation = await createConversationMutation.mutateAsync(
          data.transcription.substring(0, 50) + '...'
        );
        setCurrentConversationId(newConversation.id);
      }

      // Add user message
      if (currentConversationId) {
        await addMessageMutation.mutateAsync({
          conversationId: currentConversationId,
          role: 'user',
          content: data.transcription,
        });

        // Add assistant response
        await addMessageMutation.mutateAsync({
          conversationId: currentConversationId,
          role: 'assistant',
          content: data.response,
        });
      }

      // Speak the response
      speechSynthesis.speak(data.response);

      // Handle special actions
      if (data.action === 'weather' && data.data) {
        const weatherInfo = `The temperature is ${data.data.temperature}°C with ${data.data.description}. Humidity is ${data.data.humidity}% and wind speed is ${data.data.windSpeed} km/h.`;
        setTimeout(() => speechSynthesis.speak(weatherInfo), 2000);
      }
      
      if (data.action === 'music' && data.data) {
        if (data.data.url) {
          setCurrentMusicUrl(data.data.url);
          playMusic(data.data.url);
        }
      }
    },
    onError: (error) => {
      const errorMessage = (error as Error).message;
      
      if (errorMessage === 'USE_CLIENT_SIDE_TRANSCRIPTION') {
        // Switch to client-side speech recognition mode
        setStatusText("Using browser speech recognition...");
        handleClientSideRecording();
      } else {
        console.error('Voice processing error:', error);
        toast({
          title: "Processing Error",
          description: errorMessage,
          variant: "destructive",
        });
        setStatusText("Error processing voice");
      }
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/conversations', { title });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: async (message: { conversationId: string; role: string; content: string }) => {
      const response = await apiRequest('POST', `/api/conversations/${message.conversationId}/messages`, {
        role: message.role,
        content: message.content,
      });
      return response.json();
    },
    onSuccess: () => {
      if (currentConversationId) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId, 'messages'] });
      }
    },
  });

  const weatherMutation = useMutation({
    mutationFn: async (location?: string) => {
      const url = location ? `/api/weather?location=${encodeURIComponent(location)}` : '/api/weather';
      const response = await apiRequest('GET', url);
      return response.json();
    },
    onSuccess: (data) => {
      const weatherText = `Current weather in ${data.location}: ${data.temperature}°C, ${data.description}. Humidity ${data.humidity}%, wind speed ${data.windSpeed} km/h.`;
      speechSynthesis.speak(weatherText);
      toast({
        title: "Weather Update",
        description: weatherText,
      });
    },
  });

  // Client-side speech recognition handler with auto-retry
  const handleClientSideRecording = async () => {
    try {
      if (!speechRecognition.isSupported) {
        toast({
          title: "Speech Recognition Not Supported",
          description: "Please use Chrome, Edge, or Safari for voice input.",
          variant: "destructive",
        });
        return;
      }

      if (speechRecognition.isListening) {
        speechRecognition.stopListening();
        // Process the final transcript
        if (speechRecognition.transcript.trim()) {
          setIsProcessing(true);
          setStatusText("Processing your request...");
          processVoiceMutation.mutate({ transcriptionText: speechRecognition.transcript });
        } else {
          setStatusText("No speech detected. Try again.");
          setTimeout(() => setStatusText("Click to try again"), 2000);
        }
      } else {
        setStatusText("🗣️ Browser listening... Speak clearly");
        speechRecognition.resetTranscript();
        await speechRecognition.startListening();
        
        // Auto-stop after 10 seconds if no speech detected
        setTimeout(() => {
          if (speechRecognition.isListening && !speechRecognition.transcript) {
            speechRecognition.stopListening();
            setStatusText("No speech detected. Click to try again.");
          }
        }, 10000);
      }
    } catch (error) {
      console.error("Speech recognition error:", error);
      toast({
        title: "Voice Input Error",
        description: "Please check microphone permissions and try again.",
        variant: "destructive",
      });
      setStatusText("Click to try again");
    }
  };

  // Enhanced voice recording handlers with real-time feedback
  const handleMicrophoneToggle = async () => {
    if (speechRecognition.isListening) {
      // Stop listening and process the result
      speechRecognition.stopListening();
      setIsListening(false);
      
      // If we have a transcript, process it immediately
      if (speechRecognition.transcript.trim()) {
        setStatusText("Processing your message...");
        setIsProcessing(true);
        processVoiceMutation.mutate({ 
          transcriptionText: speechRecognition.transcript,
          conversationId: currentConversation?.id 
        });
      } else {
        setStatusText("No speech detected. Click to try again.");
      }
    } else {
      // Start listening with browser speech recognition
      try {
        if (!speechRecognition.isSupported) {
          toast({
            title: "Speech Recognition Not Available",
            description: "Please use Chrome, Edge, or Safari for voice input.",
            variant: "destructive",
          });
          return;
        }

        setStatusText("Listening... Click microphone again to stop");
        setIsListening(true);
        speechRecognition.resetTranscript(); // Clear previous transcript
        await speechRecognition.startListening();
        
      } catch (error) {
        console.error("Speech recognition error:", error);
        toast({
          title: "Voice Input Error",
          description: "Please check microphone permissions and try again.",
          variant: "destructive",
        });
        setStatusText("Click to try again");
        setIsListening(false);
      }
    }
  };

  // Music handling functions
  const handleMusicRequest = async (query: string) => {
    try {
      // Use a free music API or search for royalty-free music
      const response = await fetch(`/api/music?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          setCurrentMusicUrl(data.url);
          playMusic(data.url);
          speechSynthesis.speak(`Playing ${data.title || 'music'} for you.`);
        } else {
          speechSynthesis.speak("I couldn't find that music. Let me play some ambient music instead.");
          // Fallback to a royalty-free ambient track
          const ambientUrl = "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav";
          setCurrentMusicUrl(ambientUrl);
          playMusic(ambientUrl);
        }
      } else {
        // Fallback when API is not available
        speechSynthesis.speak("Music playback is being set up. For now, I can suggest popular music streaming services like Spotify, Apple Music, or YouTube Music.");
      }
    } catch (error) {
      console.error("Music error:", error);
      speechSynthesis.speak("I'm having trouble with music playback right now. You can ask me to help you find music on streaming platforms.");
    }
  };

  const playMusic = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    audioRef.current = new Audio(url);
    audioRef.current.play().then(() => {
      setIsPlaying(true);
    }).catch(error => {
      console.error("Audio playback error:", error);
      speechSynthesis.speak("Sorry, I couldn't play that audio file.");
    });
  };

  const pauseMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const stopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  // Enhanced quick action handlers
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'weather':
        weatherMutation.mutate(undefined);
        break;
      case 'news':
        // Fetch actual news
        fetch('/api/news')
          .then(res => res.json())
          .then(data => {
            if (data.articles && data.articles.length > 0) {
              const newsText = `Here are the latest headlines: ${data.articles.slice(0, 3)
                .map((article: any) => article.title).join('. ')}`;
              speechSynthesis.speak(newsText);
            }
          })
          .catch(() => {
            speechSynthesis.speak("I'm unable to fetch the latest news right now.");
          });
        break;
      case 'reminder':
        speechSynthesis.speak("What would you like me to remind you about? For example, say 'remind me to call John in 2 hours'");
        break;
      case 'music':
        handleMusicRequest("play some music");
        break;
    }
  };

  // Wake word toggle handler
  const handleWakeWordToggle = async () => {
    if (wakeWordEnabled) {
      wakeWord.stopWakeWordDetection();
      setWakeWordEnabled(false);
      setStatusText("Wake word detection disabled");
    } else {
      try {
        await wakeWord.startWakeWordDetection();
        setWakeWordEnabled(true);
        setStatusText("Listening for wake word 'Jarvis'...");
      } catch (error) {
        toast({
          title: "Wake Word Error",
          description: "Failed to start wake word detection. Please check microphone permissions.",
          variant: "destructive",
        });
      }
    }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setStatusText("Say something or click to start");
  };

  // Auto-scroll messages
  useEffect(() => {
    if (responseAreaRef.current) {
      responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Effects for real-time transcript updates
  useEffect(() => {
    if (speechRecognition.transcript) {
      setCurrentTranscript(speechRecognition.transcript);
    }
  }, [speechRecognition.transcript]);

  // Update status based on recording state with enhanced feedback
  useEffect(() => {
    if (audioRecorder.isRecording && !isProcessing) {
      setStatusText("🎤 Recording... Speak now");
      setIsListening(true);
    } else if (speechRecognition.isListening && !isProcessing) {
      setStatusText("🗣️ Browser listening... Speak now");
      setIsListening(true);
    } else if (isProcessing) {
      setStatusText("Processing your request...");
      setIsListening(false);
    } else {
      setStatusText("Say 'Jarvis' or click to start");
      setIsListening(false);
      setCurrentTranscript("");
    }
  }, [audioRecorder.isRecording, speechRecognition.isListening, isProcessing]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100" data-testid="voice-assistant">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentConversationId={currentConversationId || undefined}
        onConversationSelect={setCurrentConversationId}
        onNewConversation={handleNewConversation}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <header className="bg-slate-900 border-b border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                data-testid="button-toggle-sidebar"
              >
                <Menu className="h-4 w-4 text-slate-400" />
              </Button>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  Jarvis AI
                </h1>
              </div>
            </div>
            
            {/* Status Indicators */}
            <div className="flex items-center space-x-4">
              {/* Wake Word Status */}
              <div className="flex items-center space-x-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  wakeWordEnabled ? "bg-purple-500 animate-pulse" : "bg-slate-500"
                )}></div>
                <span className="text-sm text-slate-400">
                  {wakeWordEnabled ? "Wake Word Active" : "Manual Mode"}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-400">AI Online</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Cloud className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-slate-400">Cloud APIs</span>
              </div>
              
              {/* Wake Word Toggle */}
              <Button
                variant={wakeWordEnabled ? "default" : "ghost"}
                size="sm"
                onClick={handleWakeWordToggle}
                disabled={wakeWord.isListening && !wakeWordEnabled}
                data-testid="button-toggle-wake-word"
                className={cn(
                  "text-xs",
                  wakeWordEnabled && "bg-purple-600 hover:bg-purple-700"
                )}
              >
                {wakeWordEnabled ? "Wake: ON" : "Wake: OFF"}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                data-testid="button-open-settings-header"
              >
                <i className="fas fa-sliders-h text-slate-400"></i>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 flex items-center justify-center p-8 relative">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-transparent to-purple-500"></div>
          </div>
          
          {/* Central Voice Interface */}
          <div className="relative z-10 text-center max-w-2xl mx-auto">
            {/* Voice Visualization */}
            <div className="mb-12">
              <VoiceVisualizer
                isActive={isListening || isProcessing}
                className="justify-center"
              />
            </div>

            {/* Main Microphone Button */}
            <div className="mb-8">
              <Button
                onClick={handleMicrophoneToggle}
                disabled={isProcessing}
                className={cn(
                  "w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 transform hover:scale-105",
                  isListening 
                    ? "bg-red-500 hover:bg-red-600 animate-pulse" 
                    : "bg-gradient-to-r from-indigo-500 to-purple-500 hover:shadow-indigo-500/25",
                  isProcessing && "opacity-50 cursor-not-allowed"
                )}
                data-testid="button-microphone"
              >
                {isListening ? (
                  <MicOff className="h-8 w-8 text-white" />
                ) : (
                  <Mic className="h-8 w-8 text-white" />
                )}
                <div className="absolute inset-0 rounded-full bg-indigo-500 opacity-20 animate-pulse"></div>
              </Button>
              
              {/* Status Text */}
              <p className="mt-6 text-lg text-slate-300" data-testid="status-text">
                {statusText}
              </p>
              
              {/* Recording Duration */}
              {audioRecorder.isRecording && (
                <p className="mt-2 text-sm text-slate-400" data-testid="recording-duration">
                  Recording: {audioRecorder.duration.toFixed(1)}s
                </p>
              )}
              
              {/* Real-time Transcript Display */}
              {(speechRecognition.isListening || speechRecognition.transcript) && (
                <div className="mt-4 p-4 bg-slate-800/30 backdrop-blur-sm border border-slate-600 rounded-lg max-w-md mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">What I'm hearing:</span>
                    {speechRecognition.isListening && (
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-red-400">Listening</span>
                      </div>
                    )}
                  </div>
                  <p className="text-slate-200 text-sm min-h-[20px]" data-testid="live-transcript">
                    {speechRecognition.transcript || "..."}
                  </p>
                  {speechRecognition.confidence > 0 && (
                    <div className="mt-2 text-xs text-slate-500">
                      Confidence: {Math.round(speechRecognition.confidence * 100)}%
                    </div>
                  )}
                </div>
              )}
              
              {/* Error Display */}
              {speechRecognition.error && (
                <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded-lg max-w-md mx-auto">
                  <p className="text-red-400 text-sm" data-testid="error-message">
                    {speechRecognition.error}
                  </p>
                  <button 
                    onClick={() => speechRecognition.resetTranscript()}
                    className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
                  >
                    Try Again
                  </button>
                </div>
              )}
              
              {/* Text Input Option - Always Available */}
              <div className="mt-4 max-w-md mx-auto">
                <p className="text-xs text-slate-500 mb-2 text-center">
                  {speechRecognition.isSupported ? "Voice not working? Type instead:" : "Voice input not available. Type your message:"}
                </p>
                <div className="flex space-x-2">
                  <input
                    ref={textInputRef}
                    type="text"
                    placeholder={speechRecognition.isListening ? "Listening..." : "Type your message here..."}
                    className={cn(
                      "flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none",
                      speechRecognition.isListening 
                        ? "bg-red-900/20 border-red-500 text-red-200" 
                        : "bg-slate-800 border-slate-600 text-slate-200 focus:border-indigo-500"
                    )}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim() && !speechRecognition.isListening) {
                        setIsProcessing(true);
                        processVoiceMutation.mutate({ transcriptionText: e.currentTarget.value });
                        e.currentTarget.value = '';
                      }
                    }}
                    data-testid="manual-text-input"
                    disabled={isProcessing}
                    readOnly={speechRecognition.isListening}
                  />
                  <Button
                    size="sm"
                    disabled={isProcessing}
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      if (input?.value.trim()) {
                        setIsProcessing(true);
                        processVoiceMutation.mutate({ transcriptionText: input.value });
                        input.value = '';
                      }
                    }}
                    data-testid="send-text-button"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Button
                variant="ghost"
                className="p-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl hover:bg-slate-700/50 h-auto flex-col space-y-2"
                onClick={() => handleQuickAction('weather')}
                disabled={weatherMutation.isPending}
                data-testid="button-weather"
              >
                <CloudSun className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium">Weather</span>
              </Button>
              
              <Button
                variant="ghost"
                className="p-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl hover:bg-slate-700/50 h-auto flex-col space-y-2"
                onClick={() => handleQuickAction('news')}
                data-testid="button-news"
              >
                <Newspaper className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium">News</span>
              </Button>
              
              <Button
                variant="ghost"
                className="p-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl hover:bg-slate-700/50 h-auto flex-col space-y-2"
                onClick={() => handleQuickAction('reminder')}
                data-testid="button-reminder"
              >
                <Bell className="h-5 w-5 text-indigo-500" />
                <span className="text-sm font-medium">Reminder</span>
              </Button>
              
              <Button
                variant="ghost"
                className="p-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl hover:bg-slate-700/50 h-auto flex-col space-y-2"
                onClick={() => handleQuickAction('music')}
                data-testid="button-music"
              >
                <Music className="h-5 w-5 text-purple-500" />
                <span className="text-sm font-medium">Music</span>
              </Button>
            </div>

            {/* Chat Conversation Box */}
            {currentConversation && messages.length > 0 && (
              <div className="mt-8 max-w-2xl mx-auto">
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center">
                    <Bot className="h-5 w-5 mr-2 text-indigo-400" />
                    Conversation
                  </h3>
                  <div className="space-y-4" ref={responseAreaRef}>
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex max-w-[80%] rounded-lg p-3 text-sm",
                          message.role === 'user'
                            ? "ml-auto bg-indigo-600 text-white"
                            : "mr-auto bg-slate-700 text-slate-200"
                        )}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2 mb-1">
                            {message.role === 'user' ? (
                              <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium">U</span>
                              </div>
                            ) : (
                              <Bot className="w-6 h-6 text-indigo-400" />
                            )}
                            <span className="text-xs opacity-75">
                              {message.role === 'user' ? 'You' : 'Jarvis'}
                            </span>
                          </div>
                          <p className="whitespace-pre-line">{message.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Music Player */}
            {currentMusicUrl && (
              <div className="mt-8 max-w-md mx-auto">
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                        <Music className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Now Playing</p>
                        <p className="text-xs text-slate-400">Background Music</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => isPlaying ? pauseMusic() : playMusic(currentMusicUrl)}
                        className="text-slate-400 hover:text-white"
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={stopMusic}
                        className="text-slate-400 hover:text-white"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="flex items-center justify-center space-x-2 text-indigo-500" data-testid="processing-indicator">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            )}
          </div>
        </main>

        {/* Response Area */}
        <div 
          ref={responseAreaRef}
          className="bg-slate-900/50 backdrop-blur-sm border-t border-slate-700 p-6 max-h-80 overflow-y-auto"
          data-testid="response-area"
        >
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">Start a conversation by speaking or clicking the microphone</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={cn(
                  "flex",
                  message.role === 'user' ? "justify-end" : "items-start space-x-3"
                )} data-testid={`message-${message.role}-${message.id}`}>
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <Card className={cn(
                    "px-4 py-3 max-w-xs lg:max-w-md",
                    message.role === 'user' 
                      ? "bg-indigo-600 text-white" 
                      : "bg-slate-800 text-slate-100"
                  )}>
                    <p className="text-sm">{message.content}</p>
                  </Card>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Error Display */}
      {audioRecorder.error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white p-4 rounded-lg" data-testid="error-message">
          {audioRecorder.error}
        </div>
      )}
    </div>
  );
}
