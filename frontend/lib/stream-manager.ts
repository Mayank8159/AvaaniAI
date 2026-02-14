import { io, Socket } from "socket.io-client"; // If using socket.io, otherwise native WebSocket

// We are using Native WebSocket for Python FastAPI compatibility
export class StreamManager {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private isConnected = false;
  
  // Callbacks for UI updates
  public onStatusChange: (status: string) => void = () => {};
  public onEmotionUpdate: (emotion: string) => void = () => {};
  public onTextReceived: (text: string) => void = () => {};

  constructor() {
    if (typeof window !== "undefined") {
      // Initialize Audio Context (must be triggered by user interaction first)
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Matches Kokoro output
      });
    }
  }

  connect(userId: string, username: string) {
    if (this.isConnected) return;

    const url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/avaani";
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("✅ Connected to Avaani Brain");
      this.isConnected = true;
      this.onStatusChange("connected");

      // 1. Send Config Packet immediately
      this.sendJson({
        type: "config",
        user_id: userId,
        username: username
      });
    };

    this.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "status":
          this.onStatusChange(data.mode); // e.g. "thinking", "listening"
          break;
        
        case "response_start":
          this.onTextReceived(data.text);
          this.onEmotionUpdate(data.emotion);
          break;

        case "audio_chunk":
          // Play the audio chunk
          this.queueAudio(data.payload, data.sample_rate);
          // Update emotion if changed mid-sentence
          if (data.emotion) this.onEmotionUpdate(data.emotion);
          break;
      }
    };

    this.ws.onclose = () => {
      console.log("❌ Disconnected");
      this.isConnected = false;
      this.onStatusChange("disconnected");
    };
  }

  sendVideoFrame(base64Frame: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendJson({
        type: "video",
        payload: base64Frame
      });
    }
  }

  sendAudioChunk(float32Array: Float32Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Convert Float32 -> Int16 -> Base64
      const int16Array = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Binary to Base64 manually to avoid stack overflow
      let binary = '';
      const bytes = new Uint8Array(int16Array.buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      
      this.sendJson({
        type: "audio",
        payload: btoa(binary)
      });
    }
  }

  private sendJson(data: any) {
    this.ws?.send(JSON.stringify(data));
  }

  private async queueAudio(base64Pcm: string, sampleRate: number) {
    if (!this.audioContext) return;

    // Base64 -> ArrayBuffer
    const binaryString = atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Data = new Int16Array(bytes.buffer);
    
    // Create Audio Buffer
    const audioBuffer = this.audioContext.createBuffer(1, int16Data.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Int16 -> Float32
    for (let i = 0; i < int16Data.length; i++) {
      channelData[i] = int16Data[i] / 32768.0;
    }

    // Schedule Playback
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Ensure seamless playback by scheduling next chunk at end of previous
    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }
    
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }
}

export const streamManager = new StreamManager();