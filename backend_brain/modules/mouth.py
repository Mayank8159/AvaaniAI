import os
import numpy as np
import requests
import asyncio
from kokoro_onnx import Kokoro

# ==========================================
# CONFIGURATION
# ==========================================
KOKORO_MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"
VOICES_FILE_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

# Path: backend_brain/models/
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../models")
MODEL_PATH = os.path.join(MODEL_DIR, "kokoro-v1.0.int8.onnx")
VOICES_PATH = os.path.join(MODEL_DIR, "voices-v1.0.bin")

# VOICE OPTIONS:
# 'af_sarah' (Recommended), 'af_bella', 'am_michael', 'bf_emma', 'bm_george'

class Mouth:
    def __init__(self, voice="af_sarah", speed=1.0):
        print("👄 Initializing Avaani Mouth (Server Streaming Mode)...")
        
        self.voice = voice
        self.speed = speed
        
        # 1. Ensure Model Files Exist
        self._ensure_models()
        
        # 2. Load Model
        try:
            self.kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
            print(f"✅ TTS Model Loaded. Voice: {self.voice}")
        except Exception as e:
            print(f"❌ Error loading Kokoro: {e}")
            self.kokoro = None

    def _ensure_models(self):
        """Downloads the lightweight ONNX models if missing."""
        if not os.path.exists(MODEL_DIR):
            os.makedirs(MODEL_DIR)
        
        if not os.path.exists(MODEL_PATH):
            print("⬇️ Downloading Kokoro Model (80MB)...")
            r = requests.get(KOKORO_MODEL_URL)
            with open(MODEL_PATH, "wb") as f: f.write(r.content)
            
        if not os.path.exists(VOICES_PATH):
            print("⬇️ Downloading Voices File...")
            r = requests.get(VOICES_FILE_URL)
            with open(VOICES_PATH, "wb") as f: f.write(r.content)

    async def generate_stream(self, text):
        """
        Async Generator for Server.
        Yields: (pcm_bytes, sample_rate)
        """
        if not text or not self.kokoro:
            return

        try:
            # Create stream from Kokoro
            stream = self.kokoro.create_stream(
                text, 
                voice=self.voice, 
                speed=self.speed, 
                lang="en-us"
            )

            # Iterate over chunks
            async for samples, sample_rate in stream:
                # CONVERSION: Float32 (-1.0 to 1.0) -> Int16 PCM (-32768 to 32767)
                # This is the standard format for browsers and raw audio players.
                pcm_data = (samples * 32767).astype(np.int16).tobytes()
                
                yield pcm_data, sample_rate

        except Exception as e:
            print(f"❌ Audio Generation Error: {e}")

    def update_voice(self, voice_name):
        """Allows dynamic voice switching per user session."""
        self.voice = voice_name