import torch
import numpy as np
import os
import time
import string
from faster_whisper import WhisperModel
from scipy import signal

# ==========================================
# CONFIGURATION
# ==========================================
# Anchor paths to this file's location
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR_NAME = "base.en" 
MODEL_PATH = os.path.join(CURRENT_DIR, "../../models", MODEL_DIR_NAME)

DEVICE = "cpu"
COMPUTE_TYPE = "int8" 

# VAD / Sensitivity
VAD_THRESHOLD = 0.5               
SILENCE_LIMIT = 0.8               # Seconds of silence to consider sentence finished
MIN_SPEECH_DURATION = 0.4         # Minimum speech duration to trigger STT

# DATASETS
BLACKLIST = {
    "thank you", "thanks", "subtitles", "copyright", "audio", "video", 
    "thanks for watching", "watching", "subscribe"
}

def strip_punctuation(s):
    return s.translate(str.maketrans('', '', string.punctuation))

class EarSystem:
    def __init__(self):
        print(f"👂 Initializing Avaani Ears (Server DSP Mode)...")
        
        # 1. Load VAD (Silero)
        torch.set_num_threads(4) 
        try:
            self.vad_model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=True,
                trust_repo=True
            )
        except Exception as e:
            print(f"❌ VAD Load Error: {e}")
            raise

        # 2. Load Whisper
        if os.path.exists(MODEL_PATH):
            print(f"   - Loading Local Model: {MODEL_PATH}")
            model_source = MODEL_PATH
        else:
            print(f"   - Downloading Model: {MODEL_DIR_NAME}")
            model_source = MODEL_DIR_NAME

        self.stt_model = WhisperModel(
            model_size_or_path=model_source,
            device=DEVICE, 
            compute_type=COMPUTE_TYPE, 
            cpu_threads=4,
            local_files_only=os.path.exists(MODEL_PATH)
        )
        
        # 3. DSP Pipeline
        # 80Hz Highpass (rumble), 7500Hz Lowpass (aliasing)
        self.sos = signal.butter(10, [80, 7500], 'bandpass', fs=16000, output='sos')

        # 4. State
        self.audio_buffer = []        
        self.is_speaking = False      
        self.silence_start_time = None
        self.status = "listening" 
        print("✅ Ears Active.")

    def process_chunk(self, audio_chunk_float32):
        """
        Server API: Ingests audio chunk (numpy float32) from WebSocket.
        Returns: String (Text) if sentence complete, else None.
        """
        # --- STAGE 1: SIGNAL GATE ---
        # If signal is incredibly weak (< 1.5%), zero it out (don't delete, keep timing)
        if np.max(np.abs(audio_chunk_float32)) < 0.015:
            audio_chunk_float32[:] = 0.0

        # --- STAGE 2: VAD ---
        audio_tensor = torch.tensor(audio_chunk_float32)
        
        try:
            speech_prob = self.vad_model(audio_tensor, 16000).item()
        except:
            speech_prob = 0.0

        current_time = time.time()
        
        if speech_prob > VAD_THRESHOLD:
            # SPEECH DETECTED
            if not self.is_speaking:
                self.is_speaking = True
                self.status = "receiving_speech"
                # print("   --> [Speech Started]")
            
            self.silence_start_time = None
            self.audio_buffer.extend(audio_chunk_float32)
            
        else:
            # SILENCE DETECTED
            if self.is_speaking:
                if self.silence_start_time is None:
                    self.silence_start_time = current_time
                
                duration_silent = current_time - self.silence_start_time
                
                if duration_silent < SILENCE_LIMIT:
                    # Allow short pauses (breathing)
                    self.audio_buffer.extend(audio_chunk_float32)
                else:
                    # --- SENTENCE COMPLETED ---
                    self.is_speaking = False
                    self.status = "processing"
                    
                    # Process the accumulated buffer
                    transcript = self._process_buffer()
                    
                    # Reset State
                    self.audio_buffer = []
                    self.silence_start_time = None
                    self.status = "listening"
                    
                    if transcript:
                        return transcript

        return None

    def _process_buffer(self):
        """Filters audio, Boosts Volume, and Transcribes."""
        # 1. Duration Check (Ignore glitches < 0.4s)
        if len(self.audio_buffer) < 6400: # 6400 samples = 0.4s at 16k
            return None
            
        audio_data = np.array(self.audio_buffer, dtype=np.float32)

        # --- DSP PIPE ---
        try:
            # A. Bandpass Filter
            clean_audio = signal.sosfilt(self.sos, audio_data)
            
            # B. Normalization / Smart Boost
            max_val = np.max(np.abs(clean_audio))
            if max_val > 0.05: 
                # Target 90% volume (0.9)
                gain = 0.9 / max_val 
                clean_audio = clean_audio * gain
            
            audio_data = clean_audio
        except Exception:
            pass 

        # --- TRANSCRIPTION ---
        try:
            segments, info = self.stt_model.transcribe(
                audio_data, 
                beam_size=5, 
                language="en",
                condition_on_previous_text=False,
                initial_prompt="Avaani. Hello Avaani, I am speaking to you."
            )
            
            text = " ".join([segment.text for segment in segments]).strip()
            
            # --- CLEANING & LOGIC ---
            if not text or len(text) < 2: return None
            
            # 1. Hallucination Check
            clean_check = strip_punctuation(text.lower())
            if clean_check in BLACKLIST: 
                return None
            
            return text
                
        except Exception as e:
            print(f"STT Error: {e}")
            
        return None

    def get_status(self):
        return self.status