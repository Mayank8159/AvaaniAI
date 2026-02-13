// features/speech/SpeechController.ts
import type { VRM } from "@pixiv/three-vrm";

export class SpeechController {
  private vrm: VRM;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private isProcessing = false;

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  public async speak(audioUrl: string) {
    // 1. Setup Audio API on first interaction
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Connect Source -> Analyser -> Speakers
    source.connect(this.analyser!);
    this.analyser!.connect(this.audioContext.destination);

    source.start(0);
    this.isProcessing = true;

    source.onended = () => {
      this.isProcessing = false;
      this.setMouthValue(0); // Close mouth when done
    };
  }

  public update() {
    if (!this.isProcessing || !this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate average volume (RMS-ish)
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;
    
    // Map volume (0-255) to mouth opening (0-1.0)
    // We add a sensitivity multiplier (2.0) and clamp it
    const mouthValue = Math.min(1.0, (average / 128) * 2.0);
    this.setMouthValue(mouthValue);
  }

  private setMouthValue(value: number) {
    const manager = this.vrm.expressionManager;
    if (!manager) return;

    // VRM 1.0 standard mouth shapes
    // We primarily use 'aa' for general talking intensity
    manager.setValue("aa", value);
    // Add a tiny bit of 'oh' for rounder mouth movement
    manager.setValue("oh", value * 0.2);
  }
}