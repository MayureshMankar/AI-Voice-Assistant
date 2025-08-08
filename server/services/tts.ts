import fs from 'fs';
import path from 'path';

export interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  getAvailableVoices?(): Promise<string[]>;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  language?: string;
  style?: number;
}

// Browser TTS Provider (fallback)
export class BrowserTTSProvider implements TTSProvider {
  name = 'browser';
  
  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    // This is a mock implementation for server-side
    // In a real browser environment, you would use the Web Speech API
    throw new Error('Browser TTS is only available in client-side applications');
  }
  
  getAvailableVoices(): Promise<string[]> {
    // Mock implementation
    return Promise.resolve(['default']);
  }
}

// ElevenLabs TTS Provider
export class ElevenLabsTTSProvider implements TTSProvider {
  name = 'elevenlabs';
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';
  private availableVoices: string[] = [
    'Rachel', 'Drew', 'Clyde', 'Paul', 'Domi', 'Dave', 'Fin', 'Sarah',
    'Antoni', 'Thomas', 'Charlie', 'George', 'Emily', 'Elli'
  ];
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY || '';
  }
  
  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }
    
    // Validate voice
    if (options.voice && !this.availableVoices.includes(options.voice)) {
      console.warn(`Unknown ElevenLabs voice: ${options.voice}. Using default: Rachel`);
      options.voice = 'Rachel';
    }
    
    const voiceId = options.voice || 'Rachel'; // Default voice
    const url = `${this.baseUrl}/text-to-speech/${voiceId}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
            style: options.style || 0.0,
            use_speaker_boost: true
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errorText}`);
      }
      
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  async getAvailableVoices(): Promise<string[]> {
    return [...this.availableVoices];
  }
}

// Google Cloud TTS Provider  
export class GoogleCloudTTSProvider implements TTSProvider {
  name = 'google';
  private apiKey: string;
  private baseUrl = 'https://texttospeech.googleapis.com/v1';
  private availableVoices: Record<string, string[]> = {
    'en-US': ['en-US-Journey-F', 'en-US-News-K', 'en-US-News-L', 'en-US-Standard-A', 'en-US-Standard-B', 'en-US-Standard-C', 'en-US-Standard-D', 'en-US-Standard-E', 'en-US-Standard-F', 'en-US-Standard-G', 'en-US-Standard-H', 'en-US-Standard-I', 'en-US-Standard-J', 'en-US-Wavenet-A', 'en-US-Wavenet-B', 'en-US-Wavenet-C', 'en-US-Wavenet-D', 'en-US-Wavenet-E', 'en-US-Wavenet-F', 'en-US-Wavenet-G', 'en-US-Wavenet-H', 'en-US-Wavenet-I', 'en-US-Wavenet-J'],
    'en-GB': ['en-GB-Standard-A', 'en-GB-Standard-B', 'en-GB-Standard-C', 'en-GB-Standard-D', 'en-GB-Wavenet-A', 'en-GB-Wavenet-B', 'en-GB-Wavenet-C', 'en-GB-Wavenet-D'],
    'es-ES': ['es-ES-Standard-A', 'es-ES-Standard-B', 'es-ES-Wavenet-A', 'es-ES-Wavenet-B'],
    'fr-FR': ['fr-FR-Standard-A', 'fr-FR-Standard-B', 'fr-FR-Standard-C', 'fr-FR-Standard-D', 'fr-FR-Wavenet-A', 'fr-FR-Wavenet-B', 'fr-FR-Wavenet-C', 'fr-FR-Wavenet-D'],
    'de-DE': ['de-DE-Standard-A', 'de-DE-Standard-B', 'de-DE-Standard-C', 'de-DE-Standard-D', 'de-DE-Standard-E', 'de-DE-Standard-F', 'de-DE-Wavenet-A', 'de-DE-Wavenet-B', 'de-DE-Wavenet-C', 'de-DE-Wavenet-D'],
  };
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_CLOUD_API_KEY || '';
  }
  
  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('Google Cloud API key not configured');
    }
    
    const language = options.language || 'en-US';
    const voice = options.voice || 'en-US-Journey-F';
    
    // Validate voice
    const voicesForLanguage = this.availableVoices[language] || [];
    if (!voicesForLanguage.includes(voice)) {
      console.warn(`Unknown Google Cloud voice for ${language}: ${voice}. Using default: en-US-Journey-F`);
      options.voice = 'en-US-Journey-F';
    }
    
    const url = `${this.baseUrl}/text:synthesize?key=${this.apiKey}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: language,
            name: voice,
            ssmlGender: 'FEMALE'
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: options.speed || 1.0,
            pitch: options.pitch || 0.0
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Cloud TTS failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      return Buffer.from(data.audioContent, 'base64');
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  async getAvailableVoices(): Promise<string[]> {
    const allVoices: string[] = [];
    for (const [language, voices] of Object.entries(this.availableVoices)) {
      allVoices.push(...voices);
    }
    return allVoices;
  }
}

// OpenAI TTS Provider
export class OpenAITTSProvider implements TTSProvider {
  name = 'openai';
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private availableVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
  }
  
  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Validate voice
    if (options.voice && !this.availableVoices.includes(options.voice)) {
      console.warn(`Unknown OpenAI voice: ${options.voice}. Using default: nova`);
      options.voice = 'nova';
    }
    
    const url = `${this.baseUrl}/audio/speech`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd',
          input: text,
          voice: options.voice || 'nova',
          speed: options.speed || 1.0
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI TTS failed: ${response.status} - ${errorText}`);
      }
      
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  async getAvailableVoices(): Promise<string[]> {
    return [...this.availableVoices];
  }
}

// TTS Service Manager
export class TTSService {
  private providers: Map<string, TTSProvider> = new Map();
  private defaultProvider = 'openai';
  private fallbackOrder = ['openai', 'elevenlabs', 'google', 'browser'];
  private tempFiles: string[] = [];
  
  constructor() {
    // Initialize providers
    this.initializeProviders();
    
    // Set up automatic cleanup
    this.setupCleanupInterval();
  }
  
  private initializeProviders(): void {
    try {
      this.providers.set('elevenlabs', new ElevenLabsTTSProvider());
      this.providers.set('google', new GoogleCloudTTSProvider());
      this.providers.set('openai', new OpenAITTSProvider());
      this.providers.set('browser', new BrowserTTSProvider());
    } catch (error) {
      console.error('Error initializing TTS providers:', error);
    }
  }
  
  private setupCleanupInterval(): void {
    // Clean up temporary files every hour
    setInterval(() => {
      this.cleanupTempFiles();
    }, 60 * 60 * 1000);
  }
  
  private cleanupTempFiles(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    this.tempFiles = this.tempFiles.filter(filepath => {
      try {
        const stats = fs.statSync(filepath);
        const age = now - stats.mtimeMs;
        
        if (age > maxAge) {
          fs.unlinkSync(filepath);
          console.log(`Cleaned up old TTS file: ${filepath}`);
          return false;
        }
        return true;
      } catch (error) {
        console.warn(`Failed to clean up TTS file ${filepath}:`, error);
        return false;
      }
    });
  }
  
  async synthesizeToFile(
    text: string, 
    provider: string = this.defaultProvider,
    options: TTSOptions = {}
  ): Promise<string> {
    // Try the requested provider first
    try {
      const result = await this.tryProvider(text, provider, options);
      return result;
    } catch (error) {
      console.warn(`Primary TTS provider '${provider}' failed:`, error);
      
      // Try fallback providers
      for (const fallbackProvider of this.fallbackOrder) {
        if (fallbackProvider === provider) continue; // Skip the one we already tried
        
        try {
          console.log(`Trying fallback TTS provider: ${fallbackProvider}`);
          const result = await this.tryProvider(text, fallbackProvider, options);
          return result;
        } catch (fallbackError) {
          console.warn(`Fallback TTS provider '${fallbackProvider}' also failed:`, fallbackError);
        }
      }
      
      throw new Error('All TTS providers failed');
    }
  }
  
  private async tryProvider(text: string, provider: string, options: TTSOptions): Promise<string> {
    const ttsProvider = this.providers.get(provider);
    if (!ttsProvider) {
      throw new Error(`TTS provider '${provider}' not found`);
    }
    
    const audioBuffer = await ttsProvider.synthesize(text, options);
    
    // Save to temporary file
    const filename = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
    const filepath = path.join('uploads', filename);
    
    // Ensure uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    
    fs.writeFileSync(filepath, audioBuffer);
    this.tempFiles.push(filepath);
    
    console.log(`TTS audio saved to: ${filepath} using ${provider}`);
    return filepath;
  }
  
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  async getAvailableVoices(provider?: string): Promise<Record<string, string[]>> {
    if (provider) {
      const ttsProvider = this.providers.get(provider);
      if (!ttsProvider || !ttsProvider.getAvailableVoices) {
        return {};
      }
      try {
        const voices = await ttsProvider.getAvailableVoices();
        return { [provider]: voices };
      } catch (error) {
        console.warn(`Failed to get voices for provider ${provider}:`, error);
        return { [provider]: [] };
      }
    }

    const allVoices: Record<string, string[]> = {};
    
    // Check if providers map is properly initialized
    if (!this.providers || this.providers.size === 0) {
      console.warn('TTS providers map is not initialized or empty');
      return allVoices;
    }
    
    try {
      // Use Array.from to safely iterate over map entries
      const providerEntries = Array.from(this.providers.entries());
      
      for (const [name, ttsProvider] of providerEntries) {
        if (ttsProvider && ttsProvider.getAvailableVoices) {
          try {
            allVoices[name] = await ttsProvider.getAvailableVoices();
          } catch (error) {
            console.warn(`Failed to get voices for provider ${name}:`, error);
            allVoices[name] = [];
          }
        }
      }
    } catch (error) {
      console.error('Error iterating over TTS providers:', error);
    }
    
    return allVoices;
  }
  
  setDefaultProvider(provider: string): void {
    if (!this.providers.has(provider)) {
      throw new Error(`TTS provider '${provider}' not found`);
    }
    this.defaultProvider = provider;
    console.log(`Default TTS provider set to: ${provider}`);
  }
  
  cleanup(): void {
    // Clean up all temporary files
    this.tempFiles.forEach(filepath => {
      try {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log(`Cleaned up TTS file: ${filepath}`);
        }
      } catch (error) {
        console.warn(`Failed to clean up TTS file ${filepath}:`, error);
      }
    });
    this.tempFiles = [];
  }
}

export const ttsService = new TTSService();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Cleaning up TTS temporary files...');
  ttsService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Cleaning up TTS temporary files...');
  ttsService.cleanup();
  process.exit(0);
});