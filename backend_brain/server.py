import uvicorn
import os
import sys
import json
import base64
import numpy as np
import cv2
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# 1. Path Setup (Ensure we can import from modules)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 2. Module Imports
from modules.auth import router as auth_router, supabase  # We need supabase client for face loading
from modules.brain import BrainSystem
from modules.eyes import VisionSystem
from modules.ears import EarSystem
from modules.mouth import Mouth

load_dotenv()

# ==========================================
# APP INITIALIZATION
# ==========================================
app = FastAPI(title="Avaani Real-Time Core")

# CORS (Allow Frontend Access)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Auth Routes
app.include_router(auth_router)

# ==========================================
# GLOBAL AI STATE
# ==========================================
print("🚀 Booting AI Core Systems...")

# 1. BRAIN: The LLM Core (Groq)
brain = BrainSystem()

# 2. EYES: Vision System (Background Threads)
vision = VisionSystem() 

# 3. MOUTH: TTS Engine (Kokoro)
mouth = Mouth(voice="af_sarah", speed=1.0)

# Note: Ears are initialized per-connection to maintain separate VAD buffers

# ==========================================
# WEBSOCKET CONTROLLER
# ==========================================
@app.websocket("/ws/avaani")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🔌 Client Connected")
    
    # Initialize Per-Connection Resources
    ears = EarSystem()
    
    try:
        while True:
            # 1. Receive JSON Packet from Frontend
            # Format: { "type": "...", "payload": "..." }
            data = await websocket.receive_json()
            packet_type = data.get("type")
            payload = data.get("payload")

            # ------------------------------------------------
            # A. CONFIGURATION / LOGIN (Load User Faces)
            # ------------------------------------------------
            if packet_type == "config":
                # Frontend sends this after login: { "type": "config", "user_id": "...", "username": "..." }
                user_id = data.get("user_id")
                username = data.get("username")
                if user_id and username:
                    print(f"👤 Loading Biometrics for: {username}")
                    # Offload to thread to not block WS
                    await asyncio.to_thread(vision.load_user_into_memory, supabase, user_id, username)
                    await websocket.send_json({"type": "system", "status": "biometrics_loaded"})

            # ------------------------------------------------
            # B. VIDEO STREAM (Eyes)
            # ------------------------------------------------
            elif packet_type == "video":
                try:
                    # Decode Base64 -> OpenCV Image
                    img_bytes = base64.b64decode(payload)
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is not None:
                        # Non-blocking update (Vision runs in background threads)
                        vision.process_frame(frame)
                        
                        # OPTIONAL: Send back gaze/tracking data for UI debugging
                        # await websocket.send_json({
                        #     "type": "vision_debug", 
                        #     "data": vision.get_context_json()
                        # })
                except Exception:
                    pass

            # ------------------------------------------------
            # C. AUDIO STREAM (Ears)
            # ------------------------------------------------
            elif packet_type == "audio":
                try:
                    # 1. Decode Base64 -> PCM Bytes
                    audio_bytes = base64.b64decode(payload)
                    
                    # 2. Convert to Float32 for VAD/Whisper
                    # Assumes Frontend sends Int16 PCM
                    audio_chunk = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                    
                    # 3. Process Chunk (VAD Check)
                    # Returns text ONLY if a sentence is finished
                    user_text = ears.process_chunk(audio_chunk)
                    
                    # --- D. INTERACTION TRIGGER ---
                    if user_text:
                        print(f"🗣️ User: {user_text}")
                        
                        # 1. Notify Frontend: "I heard you, thinking..."
                        await websocket.send_json({"type": "status", "mode": "thinking"})
                        
                        # 2. Snapshot Vision Context
                        vision_context = vision.get_context_json()
                        
                        # 3. Brain Inference (Run in thread to avoid blocking video)
                        response_text = await asyncio.to_thread(brain.think, user_text, vision_context)
                        print(f"🤖 Brain: {response_text}")
                        
                        # 4. Get Initial Emotion (for Avatar Face)
                        current_emotion = vision_context.get("emotion", "neutral")
                        
                        # 5. Send Text Response Start
                        await websocket.send_json({
                            "type": "response_start",
                            "text": response_text,
                            "emotion": current_emotion
                        })
                        
                        # 6. Stream Audio Response (Mouth)
                        async for pcm_chunk, sample_rate in mouth.generate_stream(response_text):
                            # Encode Audio Chunk
                            b64_audio = base64.b64encode(pcm_chunk).decode('utf-8')
                            
                            # Get *Latest* Emotion (updates in real-time as user moves)
                            # This allows the avatar to react mid-sentence if the user frowns/smiles
                            live_emotion = vision.context.get("emotion", "neutral")
                            
                            await websocket.send_json({
                                "type": "audio_chunk",
                                "payload": b64_audio,
                                "sample_rate": sample_rate,
                                "emotion": live_emotion 
                            })
                            
                        # 7. End Interaction
                        await websocket.send_json({"type": "response_end"})
                        
                except Exception as e:
                    print(f"❌ Audio Pipeline Error: {e}")

    except WebSocketDisconnect:
        print("❌ Client Disconnected")
        
    except Exception as e:
        print(f"⚠️ Server Error: {e}")

# ==========================================
# HEALTH CHECK
# ==========================================
@app.get("/")
def health_check():
    return {
        "status": "online", 
        "modules": {
            "brain": "active" if brain.client else "offline",
            "vision": "active" if vision.running else "offline",
            "mouth": "active" if mouth.kokoro else "offline"
        }
    }

if __name__ == "__main__":
    # Host 0.0.0.0 is crucial for allowing external connections (e.g. from frontend)
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)