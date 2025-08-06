import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PorcupineWorker } from '@picovoice/porcupine-web';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';

export interface UseWakeWordReturn {
  isListening: boolean;
  startWakeWordDetection: () => Promise<void>;
  stopWakeWordDetection: () => void;
  error: string | null;
  wakeWordDetected: boolean;
  resetWakeWord: () => void;
}

export function useWakeWord(
  onWakeWordDetected: () => void,
  wakeWords: string[] = ['jarvis', 'computer']
): UseWakeWordReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const porcupineRef = useRef<PorcupineWorker | null>(null);
  const webVoiceProcessorRef = useRef<any>(null);

  const resetWakeWord = useCallback(() => {
    setWakeWordDetected(false);
  }, []);

  const startWakeWordDetection = useCallback(async () => {
    try {
      setError(null);
      
      // Note: In a real implementation, you would need Picovoice access key
      // For now, we'll simulate wake word detection with keyword matching
      console.log('Wake word detection would start here with:', wakeWords);
      
      // Simulate wake word detection for demo
      setIsListening(true);
      
      // For now, we'll use a simple speech recognition as fallback
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event: any) => {
          const lastResult = event.results[event.results.length - 1];
          if (lastResult.isFinal) {
            const transcript = lastResult[0].transcript.toLowerCase().trim();
            
            // Check if any wake word is detected
            const wakeWordFound = wakeWords.some(word => 
              transcript.includes(word.toLowerCase())
            );
            
            if (wakeWordFound) {
              setWakeWordDetected(true);
              onWakeWordDetected();
              recognition.stop();
            }
          }
        };
        
        recognition.onerror = (event: any) => {
          console.error('Wake word recognition error:', event.error);
          setError(`Wake word detection error: ${event.error}`);
        };
        
        recognition.start();
        webVoiceProcessorRef.current = recognition;
      } else {
        throw new Error('Speech recognition not supported in this browser');
      }
      
    } catch (err) {
      setError((err as Error).message);
      setIsListening(false);
    }
  }, [wakeWords, onWakeWordDetected]);

  const stopWakeWordDetection = useCallback(() => {
    if (webVoiceProcessorRef.current) {
      webVoiceProcessorRef.current.stop();
      webVoiceProcessorRef.current = null;
    }
    
    if (porcupineRef.current) {
      porcupineRef.current.terminate();
      porcupineRef.current = null;
    }
    
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      stopWakeWordDetection();
    };
  }, [stopWakeWordDetection]);

  return {
    isListening,
    startWakeWordDetection,
    stopWakeWordDetection,
    error,
    wakeWordDetected,
    resetWakeWord,
  };
}