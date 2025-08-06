import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Settings {
  voiceSpeed: 'slow' | 'normal' | 'fast';
  sttProvider: 'openai' | 'google';
  ttsProvider: 'browser' | 'elevenlabs' | 'google';
  saveConversations: boolean;
  voiceAnalytics: boolean;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { voices, selectedVoice, setSelectedVoice } = useSpeechSynthesis();
  
  const [settings, setSettings] = useState<Settings>({
    voiceSpeed: 'normal',
    sttProvider: 'openai',
    ttsProvider: 'browser',
    saveConversations: true,
    voiceAnalytics: false,
  });

  const handleSaveSettings = () => {
    // Save settings to localStorage
    localStorage.setItem('jarvis-settings', JSON.stringify(settings));
    localStorage.setItem('jarvis-voice', selectedVoice?.name || '');
    onClose();
  };

  const handleResetSettings = () => {
    setSettings({
      voiceSpeed: 'normal',
      sttProvider: 'openai',
      ttsProvider: 'browser',
      saveConversations: true,
      voiceAnalytics: false,
    });
    setSelectedVoice(null);
  };

  // Load settings from localStorage on mount
  React.useEffect(() => {
    const savedSettings = localStorage.getItem('jarvis-settings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }

    const savedVoice = localStorage.getItem('jarvis-voice');
    if (savedVoice && voices.length > 0) {
      const voice = voices.find(v => v.name === savedVoice);
      if (voice) {
        setSelectedVoice(voice);
      }
    }
  }, [voices, setSelectedVoice]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-md" data-testid="settings-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Voice Settings */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">Voice Settings</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-speed" className="text-sm text-slate-400">
                  Voice Speed
                </Label>
                <Select
                  value={settings.voiceSpeed}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, voiceSpeed: value as any }))}
                >
                  <SelectTrigger className="w-32 bg-slate-800 border-slate-600" data-testid="select-voice-speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="slow">Slow</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-type" className="text-sm text-slate-400">
                  Voice Type
                </Label>
                <Select
                  value={selectedVoice?.name || ''}
                  onValueChange={(value) => {
                    const voice = voices.find(v => v.name === value);
                    setSelectedVoice(voice || null);
                  }}
                >
                  <SelectTrigger className="w-40 bg-slate-800 border-slate-600" data-testid="select-voice-type">
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {voices.filter(voice => voice.lang.startsWith('en')).map((voice) => (
                      <SelectItem key={voice.name} value={voice.name}>
                        {voice.name.split(' ')[0]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* API Settings */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">API Configuration</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="stt-provider" className="text-sm text-slate-400">
                  STT Provider
                </Label>
                <Select
                  value={settings.sttProvider}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, sttProvider: value as any }))}
                >
                  <SelectTrigger className="w-40 bg-slate-800 border-slate-600" data-testid="select-stt-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="openai">OpenAI Whisper</SelectItem>
                    <SelectItem value="google">Google Cloud STT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="tts-provider" className="text-sm text-slate-400">
                  TTS Provider
                </Label>
                <Select
                  value={settings.ttsProvider}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, ttsProvider: value as any }))}
                >
                  <SelectTrigger className="w-40 bg-slate-800 border-slate-600" data-testid="select-tts-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="browser">Browser API</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                    <SelectItem value="google">Google Cloud TTS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Privacy Settings */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">Privacy</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="save-conversations" className="text-sm text-slate-400">
                  Save Conversations
                </Label>
                <Switch
                  id="save-conversations"
                  checked={settings.saveConversations}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, saveConversations: checked }))}
                  data-testid="switch-save-conversations"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-analytics" className="text-sm text-slate-400">
                  Voice Analytics
                </Label>
                <Switch
                  id="voice-analytics"
                  checked={settings.voiceAnalytics}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, voiceAnalytics: checked }))}
                  data-testid="switch-voice-analytics"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-3 pt-4">
          <Button 
            onClick={handleSaveSettings}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            data-testid="button-save-settings"
          >
            Save Changes
          </Button>
          <Button 
            variant="outline"
            onClick={handleResetSettings}
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
            data-testid="button-reset-settings"
          >
            Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
