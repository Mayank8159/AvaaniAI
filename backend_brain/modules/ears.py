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
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# Switch to "base.en" if you downloaded it, otherwise keep distil-small
MODEL_DIR_NAME = "base.en" 
MODEL_PATH = os.path.join(CURRENT_DIR, "..", "models", MODEL_DIR_NAME)

DEVICE = "cpu"
COMPUTE_TYPE = "int8" 

# VAD / Sensitivity
VAD_THRESHOLD = 0.5              
SILENCE_LIMIT = 0.8        
MIN_SPEECH_DURATION = 0.4  

# DATASETS
WAKE_VARIANTS = {"avaani", "avani", "avni", "vani", "bonnie", "avane", "honey", "money", "funny"}
BLACKLIST = {"thank you", "thanks", "subtitles", "copyright", "audio", "video"}

def strip_punctuation(s):
    return s.translate(str.maketrans('', '', string.punctuation))

class EarSystem:
    def __init__(self):
        print(f"👂 Initializing Avaani Ears (Stacking Emotion Mode)...")
        
        # 1. Load VAD
        torch.set_num_threads(4) 
        self.vad_model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            onnx=True 
        )
        
        # 2. Load Whisper
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model not found at {MODEL_PATH}")

        self.stt_model = WhisperModel(
            model_size_or_path=MODEL_PATH,
            device=DEVICE, 
            compute_type=COMPUTE_TYPE, 
            cpu_threads=4,
            local_files_only=True
        )
        
        # 3. DSP Pipeline (The "Pipe")
        # 80Hz Highpass removes rumble. 7500Hz Lowpass prevents aliasing.
        self.sos = signal.butter(10, [80, 7500], 'bandpass', fs=16000, output='sos')

        # 4. State
        self.audio_buffer = []       
        self.is_speaking = False     
        self.silence_start_time = None
        self.status = "listening" 
        print("✅ Ears Active.")

    def listen(self, audio_chunk_float32):
        """
        Ingests audio chunk. Returns JSON packet if sentence complete.
        """
        # --- STAGE 1: SIGNAL GATE ---
        # If signal is incredibly weak (< 1.5%), kill it.
        # This prevents the "white noise" from being processed.
        if np.max(np.abs(audio_chunk_float32)) < 0.015:
            audio_chunk_float32[:] = 0.0

        # --- STAGE 2: VAD ---
        audio_tensor = torch.tensor(audio_chunk_float32)
        speech_prob = self.vad_model(audio_tensor, 16000).item()
        current_time = time.time()
        
        if speech_prob > VAD_THRESHOLD:
            if not self.is_speaking:
                self.is_speaking = True
                self.status = "receiving_speech"
            
            self.silence_start_time = None
            self.audio_buffer.extend(audio_chunk_float32)
            
        else:
            if self.is_speaking:
                if self.silence_start_time is None:
                    self.silence_start_time = current_time
                
                duration_silent = current_time - self.silence_start_time
                
                if duration_silent < SILENCE_LIMIT:
                    self.audio_buffer.extend(audio_chunk_float32)
                else:
                    # End of sentence
                    self.is_speaking = False
                    self.status = "processing"
                    
                    # Process
                    result_packet = self._process_buffer()
                    
                    # Reset
                    self.audio_buffer = []
                    self.silence_start_time = None
                    self.status = "listening"
                    
                    if result_packet:
                        return result_packet
        return None

    def _process_buffer(self):
        # Ignore glitches (< 0.4s)
        if len(self.audio_buffer) < 6400: return None
            
        audio_data = np.array(self.audio_buffer, dtype=np.float32)

        # --- DSP PIPE ---
        try:
            # 1. Filter
            clean_audio = signal.sosfilt(self.sos, audio_data)
            
            # 2. Smart Boost
            # Only boost if we have a healthy signal (> 5% volume)
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
            # PROMPT BIASING: Crucial for detecting "Avaani" every time.
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
            if clean_check in BLACKLIST: return None
            
            # 2. Wake Word Scan
            # We look for ANY variant in the set WAKE_VARIANTS
            words = clean_check.split()
            wake_detected = any(w in WAKE_VARIANTS for w in words)
            
            # 3. Construct Packet
            packet = {
                "text": text,
                "wake_word_detected": wake_detected,
                # If detected, add 30s. If not, add 0s.
                "timer_add": 30 if wake_detected else 0,
                "status": "success"
            }
            
            # 4. Fix Text (Optional: Capitalize Avaani for display)
            if wake_detected:
                # Simple replacement for display niceness
                for variant in WAKE_VARIANTS:
                    packet["text"] = packet["text"].replace(variant, "Avaani").replace(variant.capitalize(), "Avaani")
                    
            return packet
                
        except Exception as e:
            print(f"STT Error: {e}")
            
        return None

    def get_status(self):
        return self.status