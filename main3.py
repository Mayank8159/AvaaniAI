import cv2
import time
import io
import requests
import numpy as np

# ==========================================
# CONFIGURATION
# ==========================================
# Make sure uvicorn is running on this port
API_URL = "http://127.0.0.1:8000/auth/signup"
CHECK_URL = "http://127.0.0.1:8000/auth/check-username/ping"

# ==========================================
# 1. SETUP HELPERS
# ==========================================
def check_server():
    """Simple ping to see if the brain is awake."""
    try:
        requests.get(CHECK_URL, timeout=1)
        return True
    except:
        return False

def get_user_input():
    print("\n📝 -- AVAANI REGISTRATION (OpenCV Client) --")
    print("   Target Server: http://127.0.0.1:8000")
    
    username = input("   🔹 Username (lowercase): ").strip().lower()
    password = input("   🔹 Password: ").strip()
    full_name = input("   🔹 Full Name: ").strip()
    
    return username, password, full_name

# ==========================================
# 2. SMART CAPTURE (OpenCV Only)
# ==========================================
def smart_auto_capture():
    print("\n📸 -- INITIALIZING CAMERA --")
    
    # Load Haar Cascade (Built-in to OpenCV)
    # We use the default path, or download it if missing
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Error: Camera not accessible.")
        return None

    # Biometric Protocol
    poses = ["LOOK FRONT", "LOOK LEFT", "LOOK RIGHT", "LOOK UP", "LOOK DOWN"]
    captured_images = []
    
    # Stability Tracking
    frames_stable = 0
    REQUIRED_STABILITY = 15 # Approx 0.5 seconds
    last_center = None
    
    print("   Instructions: Look at the camera and HOLD STILL.")
    print("   The green bar indicates stability.")

    for pose in poses:
        print(f"   👉 Requesting: {pose}")
        
        while True:
            ret, frame = cap.read()
            if not ret: break

            # Flip for mirror effect (easier for user)
            frame = cv2.flip(frame, 1)
            display_frame = frame.copy()
            
            # Convert to Grayscale for Haar Cascade (Faster)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect Faces
            faces = face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.1, 
                minNeighbors=5, 
                minSize=(100, 100) # Ignore small background faces
            )
            
            status_text = pose
            color = (0, 255, 255) # Yellow (Waiting)

            if len(faces) == 0:
                frames_stable = 0
                status_text = "NO FACE"
                color = (0, 0, 255) # Red
            
            elif len(faces) > 1:
                frames_stable = 0
                status_text = "MULTIPLE FACES"
                color = (0, 0, 255)
                
            else:
                # Get Face Coordinates
                (x, y, w, h) = faces[0]
                center_x = x + w // 2
                center_y = y + h // 2
                current_center = np.array([center_x, center_y])
                
                # Check Movement
                if last_center is not None:
                    movement = np.linalg.norm(current_center - last_center)
                    
                    if movement < 10: # 10 pixels threshold (Strict)
                        frames_stable += 1
                        color = (0, 255, 0) # Green (Good)
                        
                        # Draw Progress Bar
                        progress_width = int((frames_stable / REQUIRED_STABILITY) * w)
                        cv2.rectangle(display_frame, (x, y + h + 10), (x + progress_width, y + h + 20), (0, 255, 0), -1)
                        
                    else:
                        frames_stable = 0 # Moved too much, reset
                        color = (0, 255, 255)

                last_center = current_center
                
                # Draw Box
                cv2.rectangle(display_frame, (x, y), (x+w, y+h), color, 2)

                # TRIGGER CAPTURE
                if frames_stable >= REQUIRED_STABILITY:
                    # Flash Effect
                    white = np.ones_like(frame) * 255
                    cv2.imshow("Avaani Scanner", white)
                    cv2.waitKey(50)
                    
                    # Encode Image to JPG Bytes
                    success, buffer = cv2.imencode(".jpg", frame)
                    if success:
                        img_bytes = io.BytesIO(buffer).read()
                        captured_images.append(img_bytes)
                        print(f"      ✅ Captured {pose}")
                        frames_stable = 0
                        time.sleep(1.0) # Pause 1s so user can move to next pose
                        break

            # UI Overlay
            cv2.putText(display_frame, status_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
            cv2.imshow("Avaani Scanner", display_frame)
            
            # Exit Key
            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("   ❌ Cancelled.")
                cap.release()
                cv2.destroyAllWindows()
                return None

    cap.release()
    cv2.destroyAllWindows()
    return captured_images

# ==========================================
# 3. UPLOAD TO BACKEND
# ==========================================
def register_user(username, password, full_name, images):
    print(f"\n🚀 Sending data to Brain...")
    
    # Construct Multipart Payload
    files = []
    for i, img_bytes in enumerate(images):
        # Key must be 'images' (matches List[UploadFile] in auth.py)
        files.append(
            ('images', (f'pose_{i}.jpg', img_bytes, 'image/jpeg'))
        )

    data = {
        "username": username,
        "password": password,
        "full_name": full_name
    }

    try:
        response = requests.post(API_URL, data=data, files=files)
        
        if response.status_code == 201:
            res = response.json()
            print("\n🎉 REGISTRATION SUCCESSFUL!")
            print(f"   🆔 User ID: {res['user']['id']}")
            print(f"   🖼️ Avatar URL: {res['user']['avatar_url']}")
        elif response.status_code == 409:
            print("\n⚠️ FAILED: Username already taken.")
        else:
            print(f"\n❌ FAILED: {response.status_code}")
            print(f"   Reason: {response.text}")
            
    except Exception as e:
        print(f"❌ Network Error: {e}")

# ==========================================
# MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    if not check_server():
        print("\n❌ CRITICAL: Backend is OFFLINE.")
        print("   👉 Open a new terminal -> cd backend_brain -> uvicorn main:app --reload")
        exit()

    user, pwd, name = get_user_input()
    
    biometric_data = smart_auto_capture()
    
    if biometric_data and len(biometric_data) == 5:
        register_user(user, pwd, name, biometric_data)
    else:
        print("\n❌ Registration aborted (Incomplete data).")