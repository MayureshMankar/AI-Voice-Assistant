export interface AudioRecorderConfig {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async startRecording(config: AudioRecorderConfig = {}): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: config.sampleRate || 44100,
          channelCount: config.channels || 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm',
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
    } catch (error) {
      throw new Error(`Failed to start recording: ${(error as Error).message}`);
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

export function createAudioVisualization(
  audioContext: AudioContext,
  stream: MediaStream,
  updateCallback: (levels: number[]) => void
): () => void {
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  source.connect(analyser);
  
  let animationFrame: number;
  
  function updateVisualization() {
    analyser.getByteFrequencyData(dataArray);
    
    // Sample 9 frequency ranges for visualization bars
    const barCount = 9;
    const levels: number[] = [];
    
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor((i / barCount) * bufferLength);
      const end = Math.floor(((i + 1) / barCount) * bufferLength);
      
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += dataArray[j];
      }
      
      const average = sum / (end - start);
      levels.push(Math.min(100, (average / 255) * 100));
    }
    
    updateCallback(levels);
    animationFrame = requestAnimationFrame(updateVisualization);
  }
  
  updateVisualization();
  
  return () => {
    cancelAnimationFrame(animationFrame);
    source.disconnect();
  };
}
