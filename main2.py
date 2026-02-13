import sounddevice as sd
import numpy as np
import queue
import sys
import os
import time
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from modules.ears import EarSystem
except ImportError:
    print("❌ Error: EarSystem missing.")
    sys.exit(1)

SAMPLE_RATE = 16000
BLOCK_SIZE = 512 
audio_queue = queue.Queue()

# --- GLOBAL HAPPINESS TIMER ---
happiness_timer = 0.0

def audio_callback(indata, frames, time, status):
    if status: print(status, file=sys.stderr)
    audio_queue.put(indata.copy())

def main():
    global happiness_timer
    
    print("🚀 Initializing Avaani Ears (Stacking Test)...")
    ears = EarSystem()
    
    print("\n🎙️  Microphone Active! Say 'Avaani' to stack time.")
    print("-" * 40)

    try:
        with sd.InputStream(callback=audio_callback, channels=1, samplerate=SAMPLE_RATE, blocksize=BLOCK_SIZE):
            last_tick = time.time()
            
            while True:
                current_time = time.time()
                
                # 1. DECAY LOGIC (Simulate timer running down)
                if current_time - last_tick >= 1.0:
                    if happiness_timer > 0:
                        happiness_timer -= 1
                        print(f"   ⏳ Happiness Timer: {happiness_timer}s remaining...")
                    last_tick = current_time

                # 2. PROCESS AUDIO
                while not audio_queue.empty():
                    raw_chunk = audio_queue.get()
                    chunk_float32 = raw_chunk.flatten().astype(np.float32)
                    
                    packet = ears.listen(chunk_float32)
                    
                    if packet:
                        print(f"\n🗣️  USER: {packet['text']}")
                        
                        # 3. STACKING LOGIC
                        added_time = packet.get("timer_add", 0)
                        if added_time > 0:
                            happiness_timer += added_time
                            print(f"   >>> ✨ AVAANI DETECTED! Adding +{added_time}s")
                            print(f"   >>> ❤️ NEW HAPPINESS TOTAL: {happiness_timer}s")
                        
                        print("-" * 40)
                
                time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
        sys.exit(0)

if __name__ == "__main__":
    main()