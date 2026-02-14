class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 4096 samples = ~0.25s chunks at 16kHz
    this.bufferSize = 4096; 
    this.buffer = new Float32Array(this.bufferSize);
    this.bytesWritten = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const channelData = input[0]; // Mono channel

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bytesWritten++] = channelData[i];

      if (this.bytesWritten >= this.bufferSize) {
        this.flush();
      }
    }
    return true;
  }

  flush() {
    // Send copy of buffer to main thread
    this.port.postMessage(this.buffer.slice(0, this.bytesWritten));
    this.bytesWritten = 0;
  }
}

registerProcessor('audio-processor', AudioProcessor);