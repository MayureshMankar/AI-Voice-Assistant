import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Mic, MicOff, Cloud, Menu, Bot, CloudSun, Newspaper, Bell, Music, 
  Play, Pause, Square, Settings, MessageCircle, Plus, Zap, Activity, 
  Volume2, VolumeX, Trash2, X, Send, ChevronDown, ChevronUp, 
  MoreVertical, Edit3, Check, Archive
} from 'lucide-react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("Say 'Jarvis' or click to start");
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [currentMusicUrl, setCurrentMusicUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  
  // Scroll to chat function
  const scrollToChat = () => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };
  
  // Enhanced playMusic function
  const playMusic = useCallback(async (url: string) => {
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      // Create new audio element
      audioRef.current = new Audio(url);
      
      // Configure audio settings
      audioRef.current.volume = 1.0;
      audioRef.current.muted = false;
      audioRef.current.crossOrigin = "anonymous";
      audioRef.current.preload = "auto";
      
      // Add event listeners
      audioRef.current.onloadeddata = () => {
        setAudioInitialized(true);
      };
      
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setCurrentMusicUrl(null);
        setAudioInitialized(false);
      };
      
      audioRef.current.onerror = (e) => {
        console.error("Audio error:", e);
        speechSynthesis.speak("Sorry, I couldn't play that audio file.");
        setIsPlaying(false);
        setAudioInitialized(false);
      };
      
      // Try to play
      const playPromise = audioRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(error => {
          console.error("Autoplay prevented:", error);
          // Store the URL for manual play
          setCurrentMusicUrl(url);
          setIsPlaying(false);
          speechSynthesis.speak("Please click the play button to start the music.");
        });
      }
    } catch (error) {
      console.error("Error playing music:", error);
      speechSynthesis.speak("Sorry, I couldn't play that audio file.");
    }
  }, [speechSynthesis]);
  
  // Responsive handling
  useEffect(() => {
    const handleResize = () => {
      // No longer needed with new layout structure
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Audio event listeners
  useEffect(() => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentMusicUrl(null);
      setAudioInitialized(false);
    };
    
    const handleError = (e: Event) => {
      console.error("Audio error:", e);
      speechSynthesis.speak("Sorry, I couldn't play that audio file.");
      setIsPlaying(false);
      setAudioInitialized(false);
    };
    
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  // Queries
  const { data: currentConversation } = useQuery<Conversation>({
    queryKey: ['/api/conversations', currentConversationId],
    enabled: !!currentConversationId,
  });
  
  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ['/api/conversations', currentConversationId, 'messages'],
    enabled: !!currentConversationId,
  });

  // Delete messages mutation
  const deleteMessagesMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      const results = await Promise.allSettled(
        messageIds.map(id => 
          fetch(`/api/conversations/${currentConversationId}/messages/${id}`, {
            method: 'DELETE',
          }).then(res => {
            if (!res.ok) throw new Error(`Failed to delete message ${id}`);
            return res.json();
          })
        )
      );
      
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} messages`);
      }
      
      return results;
    },
    onMutate: async (messageIds) => {
      await queryClient.cancelQueries({ 
        queryKey: ['/api/conversations', currentConversationId, 'messages'] 
      });
      const previousMessages = queryClient.getQueryData<Message[]>([
        '/api/conversations', currentConversationId, 'messages'
      ]);
      
      queryClient.setQueryData<Message[]>(
        ['/api/conversations', currentConversationId, 'messages'],
        (old) => old?.filter(msg => !messageIds.includes(msg.id)) || []
      );
      return { previousMessages };
    },
    onSuccess: () => {
      setSelectedMessages(new Set());
      setDeleteMode(false);
      toast({
        title: "Messages Deleted",
        description: "Selected messages have been removed.",
      });
    },
    onError: (error, messageIds, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['/api/conversations', currentConversationId, 'messages'],
          context.previousMessages
        );
      }
      
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete messages. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/conversations', currentConversationId, 'messages'] 
      });
    },
  });

  // Clear entire conversation mutation
  const clearConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to clear conversation');
      }
      return response.json();
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ 
        queryKey: ['/api/conversations', conversationId, 'messages'] 
      });
      const previousMessages = queryClient.getQueryData<Message[]>([
        '/api/conversations', conversationId, 'messages'
      ]);
      
      queryClient.setQueryData<Message[]>(
        ['/api/conversations', conversationId, 'messages'],
        []
      );
      return { previousMessages };
    },
    onSuccess: () => {
      toast({
        title: "Conversation Cleared",
        description: "All messages have been deleted.",
      });
    },
    onError: (error, conversationId, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['/api/conversations', conversationId, 'messages'],
          context.previousMessages
        );
      }
      
      toast({
        title: "Clear Failed",
        description: "Failed to clear conversation. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: (data, error, conversationId) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/conversations', conversationId, 'messages'] 
      });
    },
  });

  // Enhanced voice processing mutation
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

  // Handle text input submission
  const handleTextSubmit = () => {
    if (textInput.trim() && !isProcessing) {
      setIsProcessing(true);
      processVoiceMutation.mutate({ transcriptionText: textInput });
      setTextInput('');
    }
  };

  // Handle message selection for deletion
  const toggleMessageSelection = (messageId: string) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);
  };

  // Delete selected messages
  const handleDeleteSelected = () => {
    if (selectedMessages.size > 0) {
      deleteMessagesMutation.mutate(Array.from(selectedMessages));
    }
  };

  // Enhanced microphone toggle with better mobile support
  const handleMicrophoneToggle = async () => {
    if (speechRecognition.isListening) {
      speechRecognition.stopListening();
      setIsListening(false);
      
      if (speechRecognition.transcript.trim()) {
        setStatusText("Processing your message...");
        setIsProcessing(true);
        processVoiceMutation.mutate({ 
          transcriptionText: speechRecognition.transcript
        });
      } else {
        setStatusText("No speech detected. Click to try again.");
      }
    } else {
      try {
        if (!speechRecognition.isSupported) {
          toast({
            title: "Speech Recognition Not Available",
            description: "Please type your message instead.",
            variant: "destructive",
          });
          return;
        }
        
        setStatusText("Listening... Tap microphone to stop");
        setIsListening(true);
        speechRecognition.resetTranscript();
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

  // Handle quick actions
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'weather':
        weatherMutation.mutate(undefined);
        break;
      case 'news':
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
        speechSynthesis.speak("What would you like me to remind you about?");
        break;
      case 'music':
        speechSynthesis.speak("What music would you like me to play?");
        break;
    }
  };

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update text input with speech recognition
  useEffect(() => {
    if (speechRecognition.isListening) {
      setTextInput(speechRecognition.transcript || "");
    }
  }, [speechRecognition.transcript, speechRecognition.isListening]);

  // Handle client-side recording fallback
  const handleClientSideRecording = () => {
    // Implementation for client-side recording
    console.log("Using client-side transcription");
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden">
      {/* Mobile Overlay for Sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Responsive Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-slate-900/95 backdrop-blur-lg border-r border-slate-700/50",
        "transform transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <ConversationSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          currentConversationId={currentConversationId || undefined}
          onConversationSelect={(id) => {
            setCurrentConversationId(id);
            setSidebarOpen(false);
          }}
          onNewConversation={() => {
            setCurrentConversationId(null);
            setStatusText("Say something or click to start");
            setSidebarOpen(false);
          }}
          onOpenSettings={() => {
            setSettingsOpen(true);
            setSidebarOpen(false);
          }}
          onOpenChat={messages.length > 0 ? scrollToChat : undefined}
        />
      </div>
      
      {/* Main Content Area */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300 overflow-hidden lg:overflow-visible",
        sidebarOpen ? "lg:ml-80" : ""
      )}>
        {/* Enhanced Mobile-First Header */}
        <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-30">
          <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div className="hidden sm:block">
                    <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                      Jarvis AI
                    </h1>
                    <p className="text-xs text-slate-400 hidden lg:block">Advanced Voice Assistant</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4">
                {/* Status Indicator */}
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-slate-400 hidden sm:inline">Online</span>
                </div>
                
                {/* Wake Word Toggle */}
                <Button
                  variant={wakeWordEnabled ? "default" : "ghost"}
                  size="sm"
                  onClick={async () => {
                    if (wakeWordEnabled) {
                      wakeWord.stopWakeWordDetection();
                      setWakeWordEnabled(false);
                    } else {
                      try {
                        await wakeWord.startWakeWordDetection();
                        setWakeWordEnabled(true);
                      } catch (error) {
                        toast({
                          title: "Wake Word Error",
                          description: "Failed to start wake word detection.",
                          variant: "destructive",
                        });
                      }
                    }
                  }}
                  className={cn(
                    "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs transition-all",
                    wakeWordEnabled 
                      ? "bg-purple-600/20 border-purple-500/30 text-purple-300" 
                      : "bg-slate-800/50 border-slate-600/50 text-slate-400"
                  )}
                >
                  <Zap className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">{wakeWordEnabled ? "ON" : "OFF"}</span>
                </Button>
                
                {/* Chat button - only visible on mobile/tablet when messages exist */}
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={scrollToChat}
                    className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 lg:hidden"
                  >
                    <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                )}
                
                {/* Settings Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>
        
        {/* Responsive Main Layout */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Voice Interface Section */}
          <div className="flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative min-h-screen lg:min-h-0 lg:flex-1">
            {/* Status Display */}
            <div className="text-center mb-4 sm:mb-6 lg:mb-8 px-4">
              <VoiceVisualizer
                isActive={isListening || isProcessing}
                className="justify-center mb-3 sm:mb-4 lg:mb-6"
              />
              
              <h2 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-slate-200 mb-1 sm:mb-2">
                {isListening ? "Listening..." : isProcessing ? "Processing..." : "Ready"}
              </h2>
              <p className="text-sm sm:text-base lg:text-lg text-slate-400 max-w-md">
                {statusText}
              </p>
            </div>
            
            {/* Main Microphone Button */}
            <div className="mb-4 sm:mb-6 lg:mb-8">
              <Button
                onClick={handleMicrophoneToggle}
                disabled={isProcessing}
                className={cn(
                  "relative w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 xl:w-32 xl:h-32 rounded-full transition-all duration-300 shadow-2xl",
                  isListening 
                    ? "bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 scale-110" 
                    : "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 hover:scale-105",
                  isProcessing && "opacity-75 cursor-not-allowed scale-95"
                )}
              >
                {isListening ? (
                  <MicOff className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 xl:h-10 xl:w-10 text-white" />
                ) : (
                  <Mic className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 xl:h-10 xl:w-10 text-white" />
                )}
                
                {isListening && (
                  <div className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping"></div>
                )}
              </Button>
            </div>
            
            {/* Live Transcript - Mobile Optimized */}
            {(speechRecognition.isListening || speechRecognition.transcript) && (
              <div className="mb-4 sm:mb-6 w-full max-w-sm sm:max-w-md mx-auto px-4">
                <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-600/30 rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <span className="text-xs sm:text-sm font-medium text-slate-300">Live Transcript</span>
                    {speechRecognition.isListening && (
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-red-400">Recording</span>
                      </div>
                    )}
                  </div>
                  <p className="text-slate-200 min-h-[20px] sm:min-h-[24px] text-xs sm:text-sm">
                    {speechRecognition.transcript || "..."}
                  </p>
                </div>
              </div>
            )}
            
            {/* Text Input - Always Visible */}
            <div className="w-full max-w-sm sm:max-w-md mx-auto mb-4 sm:mb-6 px-4">
              <div className="flex space-x-2">
                <input
                  ref={textInputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border bg-slate-800/50 border-slate-600/50 text-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500/50"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleTextSubmit();
                    }
                  }}
                  disabled={isProcessing || speechRecognition.isListening}
                />
                <Button
                  size="sm"
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim() || isProcessing}
                  className="px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Quick Actions - Responsive Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6 w-full max-w-sm sm:max-w-lg mx-auto px-4">
              {[
                { key: 'weather', icon: CloudSun, label: 'Weather', color: 'from-blue-500 to-cyan-500' },
                { key: 'news', icon: Newspaper, label: 'News', color: 'from-orange-500 to-red-500' },
                { key: 'reminder', icon: Bell, label: 'Remind', color: 'from-green-500 to-emerald-500' },
                { key: 'music', icon: Music, label: 'Music', color: 'from-purple-500 to-pink-500' }
              ].map(({ key, icon: Icon, label, color }) => (
                <Button
                  key={key}
                  variant="ghost"
                  onClick={() => handleQuickAction(key)}
                  className="group p-2 sm:p-3 md:p-4 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl hover:bg-slate-700/50 transition-all duration-200 h-auto flex-col space-y-1 sm:space-y-2"
                >
                  <div className={cn("w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-r flex items-center justify-center", color)}>
                    <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                  </div>
                  <span className="text-xs font-medium text-slate-200">{label}</span>
                </Button>
              ))}
            </div>
            
            {/* Processing Indicator */}
            {isProcessing && (
              <div className="flex items-center space-x-2 text-indigo-400">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            )}
          </div>
          
          {/* Enhanced Chat Section */}
          {messages.length > 0 && (
            <div ref={chatSectionRef} className="w-full lg:w-1/2 flex flex-col bg-slate-900/50 backdrop-blur-sm border-t lg:border-t-0 lg:border-l border-slate-700/50">
              {/* Chat Header */}
              <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-700/50">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200 text-sm sm:text-base">Conversation</h3>
                    <p className="text-xs text-slate-400">{messages.length} messages</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 sm:space-x-2">
                  {/* Delete Mode Toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleteMode(!deleteMode);
                      setSelectedMessages(new Set());
                    }}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      deleteMode ? "text-red-400 bg-red-500/10" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {deleteMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                  
                  {/* More Options */}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const menu = e.currentTarget.nextElementSibling as HTMLElement;
                        if (menu) {
                          menu.classList.toggle('hidden');
                          
                          const handleOutsideClick = (event: MouseEvent) => {
                            if (!menu.contains(event.target as Node) && 
                                !e.currentTarget.contains(event.target as Node)) {
                              menu.classList.add('hidden');
                              document.removeEventListener('click', handleOutsideClick);
                            }
                          };
                          
                          if (!menu.classList.contains('hidden')) {
                            setTimeout(() => {
                              document.addEventListener('click', handleOutsideClick);
                            }, 0);
                          }
                        }
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-200"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                    
                    {/* Dropdown Menu */}
                    <div className="hidden absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-50">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearConversationMutation.mutate(currentConversationId!);
                          const menu = e.currentTarget.parentElement;
                          if (menu) menu.classList.add('hidden');
                        }}
                        className="w-full justify-start px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-none first:rounded-t-lg last:rounded-b-lg"
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Clear All Messages
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Delete Mode Actions */}
              {deleteMode && (
                <div className="bg-red-500/10 border-b border-red-500/20 p-2 sm:p-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0">
                    <span className="text-sm text-red-300">
                      {selectedMessages.size} message{selectedMessages.size !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const allMessageIds = new Set(messages.map(m => m.id));
                          setSelectedMessages(allMessageIds);
                        }}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDeleteSelected}
                        disabled={selectedMessages.size === 0}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1"
                      >
                        Delete Selected
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Messages List */}
              <div 
                ref={responseAreaRef}
                className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-0 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 hover:scrollbar-thumb-slate-500"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#475569 #1e293b'
                }}
              >
                {messages.map((message, index) => (
                  <div
                    key={message.id || index}
                    className={cn(
                      "flex items-start space-x-2 sm:space-x-3 group",
                      message.role === 'user' ? "flex-row-reverse space-x-reverse" : ""
                    )}
                  >
                    {/* Message Selection Checkbox */}
                    {deleteMode && (
                      <div 
                        className={cn(
                          "flex items-center mt-1",
                          message.role === 'user' ? "order-first" : ""
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMessages.has(message.id)}
                          onChange={() => toggleMessageSelection(message.id)}
                          className="w-4 h-4 text-red-600 bg-slate-700 border-slate-600 rounded focus:ring-red-500"
                        />
                      </div>
                    )}
                    
                    {/* Avatar */}
                    {message.role === 'assistant' && (
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                    )}
                    
                    {message.role === 'user' && (
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-semibold">U</span>
                      </div>
                    )}
                    
                    {/* Message Content */}
                    <div className={cn(
                      "flex-1 max-w-[85%] sm:max-w-[75%]",
                      message.role === 'user' ? "flex justify-end" : ""
                    )}>
                      <div className={cn(
                        "rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm leading-relaxed shadow-sm relative",
                        message.role === 'user'
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                          : "bg-slate-700/70 backdrop-blur-sm text-slate-100 border border-slate-600/50"
                      )}>
                        {/* Message Header */}
                        {message.role === 'assistant' && (
                          <div className="flex items-center space-x-1 sm:space-x-2 mb-1 sm:mb-2">
                            <Bot className="h-2 w-2 sm:h-3 sm:w-3 text-indigo-400" />
                            <span className="text-xs text-slate-400 font-medium">Jarvis</span>
                            <span className="text-xs text-slate-500">
                              {new Date(message.timestamp || Date.now()).toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                        )}
                        
                        {/* Message Text */}
                        <p className="whitespace-pre-line break-words">{message.content}</p>
                        
                        {/* User Message Timestamp */}
                        {message.role === 'user' && (
                          <div className="text-xs text-indigo-200/70 mt-1 sm:mt-2 text-right">
                            {new Date(message.timestamp || Date.now()).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        )}
                        
                        {/* Individual Message Actions (on hover) */}
                        {!deleteMode && (
                          <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedMessages(new Set([message.id]));
                                setDeleteMode(true);
                              }}
                              className="p-1 bg-slate-800 border border-slate-600 rounded-md text-slate-400 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>
              
              {/* Chat Input (Alternative to voice) */}
              <div className="border-t border-slate-700/50 p-3 sm:p-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 sm:px-4 py-2 bg-slate-800/50 border border-slate-600/50 text-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500/50"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleTextSubmit();
                      }
                    }}
                    disabled={isProcessing}
                  />
                  <Button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim() || isProcessing}
                    className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Music Player - Fixed Bottom */}
        {currentMusicUrl && (
          <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/50 p-3 sm:p-4 z-40 h-16 sm:h-20">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <Music className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200 text-sm sm:text-base">Now Playing</p>
                    <p className="text-xs sm:text-sm text-slate-400">
                      {isPlaying ? "Playing" : "Paused"} - {audioInitialized ? "Ready" : "Loading..."}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.muted = !audioRef.current.muted;
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-slate-700/50"
                  >
                    {audioRef.current?.muted ? 
                      <VolumeX className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" /> : 
                      <Volume2 className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" />
                    }
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (isPlaying) {
                        audioRef.current?.pause();
                        setIsPlaying(false);
                      } else {
                        if (!audioRef.current && currentMusicUrl) {
                          audioRef.current = new Audio(currentMusicUrl);
                          audioRef.current.volume = 1.0;
                          audioRef.current.muted = false;
                        }
                        
                        if (audioRef.current) {
                          audioRef.current.play().then(() => {
                            setIsPlaying(true);
                          }).catch(error => {
                            console.error("Playback error:", error);
                            speechSynthesis.speak("Sorry, I couldn't play that audio file.");
                          });
                        }
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-slate-700/50"
                  >
                    {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current.currentTime = 0;
                      }
                      setIsPlaying(false);
                      setCurrentMusicUrl(null);
                      setAudioInitialized(false);
                    }}
                    className="p-2 rounded-lg hover:bg-slate-700/50"
                  >
                    <Square className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      
      {/* Error Notifications */}
      {audioRecorder.error && (
        <div className="fixed bottom-4 right-4 bg-red-500/90 backdrop-blur-sm text-white p-3 sm:p-4 rounded-lg shadow-lg border border-red-400 max-w-xs sm:max-w-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm">{audioRecorder.error}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => audioRecorder.error = null}
              className="p-1 text-red-200 hover:text-white"
            >
              <X className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      )}
      
      {speechRecognition.error && (
        <div className="fixed bottom-4 left-4 bg-orange-500/90 backdrop-blur-sm text-white p-3 sm:p-4 rounded-lg shadow-lg border border-orange-400 max-w-xs sm:max-w-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm">{speechRecognition.error}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => speechRecognition.resetTranscript()}
              className="p-1 text-orange-200 hover:text-white"
            >
              <X className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      )}
      
      {/* Loading States */}
      {(deleteMessagesMutation.isPending || clearConversationMutation.isPending) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center max-w-xs sm:max-w-sm mx-4">
            <div className="flex items-center justify-center space-x-2 mb-3 sm:mb-4">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <p className="text-slate-200 text-sm sm:text-base">
              {deleteMessagesMutation.isPending ? 'Deleting messages...' : 'Clearing conversation...'}
            </p>
          </div>
        </div>
      )}
      
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef} 
        className="hidden" 
        preload="metadata"
        crossOrigin="anonymous"
      />
    </div>
  );
}