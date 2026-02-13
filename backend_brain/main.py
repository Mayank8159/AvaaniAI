import cv2
import json
import time
import os
import sys
import threading
import queue
import requests
import numpy as np
import sounddevice as sd

# ==========================================
# 1. SETUP & IMPORTS
# ==========================================
# Ensure we can import from 'modules'
sys.path.append(os.path.join(os.path.dirname(__file__), 'modules'))

try:
    from modules.eyes import VisionSystem
    from modules.ears import EarSystem
except ImportError as e:
    print(f"❌ Error: Missing Modules. {e}")
    print("   Make sure 'eyes.py' and 'ears.py' are in the 'modules' folder.")
    sys.exit(1)

# Configuration
BACKEND_URL = "http://127.0.0.1:8000/auth"
CONTEXT_FILE = "live_context.json"

# Shared State (Thread-Safe)
GLOBAL_STATE = {
    "user": "Unknown",
    "vision": {},
    "audio": {"last_spoken": "", "transcript": ""},
    "timestamp": 0
}
state_lock = threading.Lock()

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================
def clear_console():
    os.system('cls' if os.name == 'nt' else 'clear')

def check_backend():
    """Ensures the Brain (Server) is reachable."""
    try:
        requests.get(f"{BACKEND_URL}/check-username/ping", timeout=1)
        return True
    except:
        return False

def save_json_packet():
    """Writes the current state to a JSON file."""
    try:
        with state_lock:
            packet = GLOBAL_STATE.copy()
            packet["timestamp"] = time.time()
        
        with open(CONTEXT_FILE, 'w') as f:
            json.dump(packet, f, indent=2)
    except Exception as e:
        print(f"⚠️ JSON Write Error: {e}")

# ==========================================
# 3. REGISTRATION MODULE (OpenCV)
# ==========================================
def run_registration():
    print("\n🔒 -- AVAANI AUTHENTICATION --")
    
    if not check_backend():
        print("❌ CRITICAL: Backend Server is OFFLINE.")
        print("   👉 Run 'uvicorn main:app --reload' in a new terminal first.")
        sys.exit(1)

    # 1. Credentials
    username = input("   🔹 Username: ").strip().lower()
    password = input("   🔹 Password: ").strip()
    full_name = input("   🔹 Full Name: ").strip()

    print("\n📸 -- BIOMETRIC SCAN --")
    print("   Look at the camera. The system will auto-capture 5 angles.")
    
    cap = cv2.VideoCapture(0)
    # Load fast face detector
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    poses = ["FRONT", "LEFT", "RIGHT", "UP", "DOWN"]
    captured_images = []
    
    for pose in poses:
        print(f"   👉 LOOK {pose}...")
        stable_frames = 0
        
        while True:
            ret, frame = cap.read()
            if not ret: break
            
            frame = cv2.flip(frame, 1)
            display = frame.copy()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 5)

            if len(faces) == 1:
                (x, y, w, h) = faces[0]
                
                # Stability Check Visual
                stable_frames += 1
                color = (0, 255, 255)
                
                if stable_frames > 15: # ~0.5s stability
                    color = (0, 255, 0)
                    # CAPTURE
                    success, buf = cv2.imencode(".jpg", frame)
                    if success:
                        import io
                        captured_images.append(io.BytesIO(buf).read())
                        print("      ✅ Captured!")
                        time.sleep(0.5)
                        break
                
                # Draw Box
                cv2.rectangle(display, (x, y), (x+w, y+h), color, 2)
                # Progress Bar
                cv2.rectangle(display, (x, y+h+5), (x + int(w * (stable_frames/15)), y+h+10), color, -1)

            else:
                stable_frames = 0
                cv2.putText(display, "LOOK HERE", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

            cv2.imshow("Avaani Auth", display)
            if cv2.waitKey(1) & 0xFF == ord('q'): sys.exit(0)

    cap.release()
    cv2.destroyWindow("Avaani Auth")

    # 2. Upload to Supabase
    print(f"\n🚀 Registering '{username}'...")
    files = [('images', (f'pose_{i}.jpg', img, 'image/jpeg')) for i, img in enumerate(captured_images)]
    data = {"username": username, "password": password, "full_name": full_name}
    
    try:
        res = requests.post(f"{BACKEND_URL}/signup", data=data, files=files)
        if res.status_code in [201, 200]:
            print("✅ Registration Successful!")
            return username
        elif res.status_code == 409:
            print("⚠️ User exists. proceeding as login...")
            return username
        else:
            print(f"❌ Auth Failed: {res.text}")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        sys.exit(1)

# ==========================================
# 4. AUDIO WORKER (Threaded)
# ==========================================
def audio_thread_logic(stop_event):
    """Runs in background to process audio without freezing video."""
    print("   🎙️  Audio System: Online")
    ears = EarSystem() # Initialize Model
    
    q = queue.Queue()
    
    def callback(indata, frames, time, status):
        q.put(indata.copy())

    # Start Mic Stream
    with sd.InputStream(callback=callback, channels=1, samplerate=16000, blocksize=8000):
        while not stop_event.is_set():
            if not q.empty():
                audio_chunk = q.get()
                # Process (Transcribe)
                # Note: ears.listen() should handle buffering internally or take raw chunks
                # Assuming ears.listen takes float32 numpy array
                result = ears.listen(audio_chunk.flatten().astype(np.float32))
                
                if result:
                    with state_lock:
                        GLOBAL_STATE["audio"]["last_spoken"] = result.get("text", "")
                        GLOBAL_STATE["audio"]["transcript"] += " " + result.get("text", "")
                    print(f"   🗣️  USER: {result.get('text')}")

# ==========================================
# 5. MAIN SYSTEM LOOP
# ==========================================
def main():
    clear_console()
    print("🚀 INITIALIZING AVAANI CORE CLIENT")
    
    # 1. Auth Phase
    user = run_registration()
    GLOBAL_STATE["user"] = user

    # 2. Start Audio Thread
    stop_audio = threading.Event()
    t_audio = threading.Thread(target=audio_thread_logic, args=(stop_audio,), daemon=True)
    t_audio.start()

    # 3. Start Vision (Main Thread)
    print("\n👁️  Vision System: Online")
    eyes = VisionSystem()
    cap = cv2.VideoCapture(0)
    
    print(f"\n✅ SYSTEM ACTIVE for User: {user}")
    print(f"📄 Writing Context to: {os.path.abspath(CONTEXT_FILE)}")
    print("------------------------------------------------")

    try:
        last_save = 0
        while True:
            ret, frame = cap.read()
            if not ret: break

            # A. Process Vision
            processed_frame = eyes.process_frame(frame)
            
            # B. Update State
            with state_lock:
                # Copy relevant keys from eyes context
                for k, v in eyes.context.items():
                    if not k.startswith('_'):
                        GLOBAL_STATE["vision"][k] = v

            # C. Save JSON (Every 0.2s)
            if time.time() - last_save > 0.2:
                save_json_packet()
                last_save = time.time()

            # D. Visuals
            # Overlay Audio Status
            with state_lock:
                last_text = GLOBAL_STATE["audio"]["last_spoken"]
            
            if last_text:
                cv2.putText(processed_frame, f"SAID: {last_text}", (20, 450), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            cv2.imshow("Avaani Core | Vision & Hearing", processed_frame)
            if cv2.waitKey(1) & 0xFF == ord('q'): break

    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
    finally:
        stop_audio.set()
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()