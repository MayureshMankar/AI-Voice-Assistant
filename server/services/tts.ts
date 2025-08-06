import fs from 'fs';
import path from 'path';

export interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  language?: string;
}

// ElevenLabs TTS Provider
export class ElevenLabsTTSProvider implements TTSProvider {
  name = 'elevenlabs';
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY || '';
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = options.voice || 'Rachel'; // Default voice
    const url = `${this.baseUrl}/text-to-speech/${voiceId}`;

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
          style: 0.0,
          use_speaker_boost: true
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS failed: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

// Google Cloud TTS Provider  
export class GoogleCloudTTSProvider implements TTSProvider {
  name = 'google';
  private apiKey: string;
  private baseUrl = 'https://texttospeech.googleapis.com/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_CLOUD_API_KEY || '';
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('Google Cloud API key not configured');
    }

    const url = `${this.baseUrl}/text:synthesize?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: options.language || 'en-US',
          name: options.voice || 'en-US-Journey-F',
          ssmlGender: 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: options.speed || 1.0,
          pitch: options.pitch || 0.0
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Cloud TTS failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return Buffer.from(data.audioContent, 'base64');
  }
}

// OpenAI TTS Provider
export class OpenAITTSProvider implements TTSProvider {
  name = 'openai';
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const url = `${this.baseUrl}/audio/speech`;

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
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS failed: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

// TTS Service Manager
export class TTSService {
  private providers: Map<string, TTSProvider> = new Map();
  private defaultProvider = 'openai';

  constructor() {
    // Initialize providers
    this.providers.set('elevenlabs', new ElevenLabsTTSProvider());
    this.providers.set('google', new GoogleCloudTTSProvider());
    this.providers.set('openai', new OpenAITTSProvider());
  }

  async synthesizeToFile(
    text: string, 
    provider: string = this.defaultProvider,
    options: TTSOptions = {}
  ): Promise<string> {
    const ttsProvider = this.providers.get(provider);
    if (!ttsProvider) {
      throw new Error(`TTS provider '${provider}' not found`);
    }

    try {
      const audioBuffer = await ttsProvider.synthesize(text, options);
      
      // Save to temporary file
      const filename = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const filepath = path.join('uploads', filename);
      
      // Ensure uploads directory exists
      if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads', { recursive: true });
      }
      
      fs.writeFileSync(filepath, audioBuffer);
      return filepath;
      
    } catch (error) {
      console.error(`TTS synthesis failed for provider ${provider}:`, error);
      throw error;
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  setDefaultProvider(provider: string): void {
    if (!this.providers.has(provider)) {
      throw new Error(`TTS provider '${provider}' not found`);
    }
    this.defaultProvider = provider;
  }
}

export const ttsService = new TTSService();