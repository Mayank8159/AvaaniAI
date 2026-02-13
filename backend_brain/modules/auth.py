import os
import io
import re
import numpy as np
import cv2
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel
from typing import List
from supabase import create_client, Client
from dotenv import load_dotenv
import asyncio
import threading
import time
from enum import Enum

# 1. Load Environment Variables
load_dotenv()

# ==========================================
# CONFIGURATION
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ CRITICAL: Missing Supabase Credentials in .env")

# Initialize Admin Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Load OpenCV Face Detector (Haar Cascade)
# This checks "Is there a face?" without needing heavy ML libraries
try:
    FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    EYE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
except Exception as e:
    print(f"⚠️ Warning: Could not load Haar Cascade. Face validation might fail. {e}")

class FacePose(Enum):
    FRONT = "front"
    LEFT = "left"
    RIGHT = "right"
    UP = "up"
    DOWN = "down"

# Global variable to store captured face images
captured_faces = {}
capture_lock = threading.Lock()

# ==========================================
# CAMERA CAPTURE FUNCTIONS
# ==========================================
def capture_face_poses():
    """
    Opens camera and guides user to capture different face poses
    """
    global captured_faces
    
    # Initialize video capture
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise HTTPException(status_code=500, detail="Could not access camera")
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    required_poses = [FacePose.FRONT, FacePose.LEFT, FacePose.RIGHT, FacePose.UP, FacePose.DOWN]
    captured_faces = {}
    
    print("📸 Camera opened. Follow the instructions to capture your face from different angles...")
    
    for pose in required_poses:
        print(f"\n🎯 Position: {pose.value.upper()}")
        print(f"👉 Please turn your face to the {pose.value}")
        print("Press SPACEBAR when ready...")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Display current frame with instructions
            display_frame = frame.copy()
            
            # Detect face in current frame
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = FACE_CASCADE.detectMultiScale(gray, 1.3, 5)
            
            # Draw rectangle around detected face
            for (x, y, w, h) in faces:
                cv2.rectangle(display_frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
            
            # Add instructions text
            cv2.putText(display_frame, f"Position: {pose.value.upper()}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(display_frame, "Press SPACEBAR when ready", 
                       (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            if len(faces) > 0:
                cv2.putText(display_frame, "Face detected! Ready to capture", 
                           (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            cv2.imshow('Face Capture', display_frame)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord(' '):  # Spacebar pressed
                if len(faces) > 0:
                    # Capture the frame with face
                    with capture_lock:
                        captured_faces[pose.value] = frame.copy()
                    print(f"✅ Captured {pose.value} position")
                    break
                else:
                    print("⚠️ No face detected. Please position your face in the frame.")
            
            elif key == ord('q'):
                cap.release()
                cv2.destroyAllWindows()
                raise HTTPException(status_code=400, detail="Face capture cancelled by user")
        
        # Brief pause before next pose
        time.sleep(0.5)
    
    cap.release()
    cv2.destroyAllWindows()
    
    # Validate that we have all required poses
    if len(captured_faces) != len(required_poses):
        missing = set([p.value for p in required_poses]) - set(captured_faces.keys())
        raise HTTPException(status_code=400, detail=f"Missing captures for positions: {missing}")
    
    print(f"✅ Successfully captured {len(captured_faces)} face poses")
    return list(captured_faces.values())

def convert_frames_to_bytes(frames):
    """
    Convert captured frames to bytes for storage
    """
    byte_images = []
    for i, frame in enumerate(frames):
        # Encode frame to JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        byte_image = buffer.tobytes()
        byte_images.append(byte_image)
    return byte_images

# ==========================================
# UTILITIES
# ==========================================
def validate_username(username: str):
    """
    Enforces: Lowercase only, no spaces, 3-20 chars.
    """
    username = username.lower().strip()
    if not re.match(r"^[a-z0-9_]{3,20}$", username):
        raise HTTPException(
            status_code=400, 
            detail="Username must be 3-20 characters, lowercase letters, numbers, or underscores only."
        )
    return username

async def check_username_availability(username: str):
    """
    Checks if username exists in the 'profiles' table.
    """
    try:
        response = supabase.table("profiles").select("username").eq("username", username).execute()
        if response.data and len(response.data) > 0:
            raise HTTPException(status_code=409, detail=f"Username '{username}' is already taken.")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"⚠️ DB Check Warning: {e}")

# ==========================================
# 1. SIGNUP API (With Camera Face Capture)
# ==========================================
@router.post("/signup", status_code=201)
async def signup(
    username: str = Form(...),
    password: str = Form(..., min_length=6),
    full_name: str = Form(...)
):
    """
    1. Validates Username.
    2. Opens camera and guides user to capture face from different angles.
    3. Creates User in Supabase.
    4. Uploads captured face images to Storage for future model training/matching.
    """
    print(f"📝 Starting Registration: {username}")

    # --- STEP 1: VALIDATION ---
    username = validate_username(username)
    await check_username_availability(username)

    # --- STEP 2: CAPTURE FACE IMAGES FROM CAMERA ---
    print("📸 Opening camera for face capture...")
    try:
        captured_frames = capture_face_poses()
        print(f"✅ Captured {len(captured_frames)} face images from camera")
    except Exception as e:
        print(f"❌ Face capture failed: {e}")
        raise HTTPException(status_code=500, detail=f"Face capture failed: {str(e)}")

    # --- STEP 3: CONVERT FRAMES TO BYTES ---
    try:
        valid_images_data = convert_frames_to_bytes(captured_frames)
        print(f"✅ Converted {len(valid_images_data)} frames to byte format")
    except Exception as e:
        print(f"❌ Frame conversion error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process captured images")

    # --- STEP 4: CREATE SUPABASE USER ---
    user_id = None
    ghost_email = f"{username}@avaani.app"

    try:
        attributes = {
            "email": ghost_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "username": username,
                "full_name": full_name
            }
        }
        
        user_response = supabase.auth.admin.create_user(attributes)
        user_id = user_response.user.id
        print(f"✅ User Created: {user_id}")

    except Exception as e:
        print(f"❌ Auth Creation Error: {e}")
        if "already registered" in str(e).lower():
             raise HTTPException(status_code=409, detail="Username is unavailable.")
        raise HTTPException(status_code=400, detail="User creation failed.")

    # --- STEP 5: UPLOAD ALL CAPTURED IMAGES ---
    try:
        main_avatar_url = ""
        
        # Upload images with specific pose naming
        for i, img_bytes in enumerate(valid_images_data):
            file_path = f"{user_id}/pose_{i}.jpg"
            
            supabase.storage.from_("faces").upload(
                file=img_bytes,
                path=file_path,
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )
            
            if i == 0:
                main_avatar_url = supabase.storage.from_("faces").get_public_url(file_path)

        # Update Profile
        update_data = {
            "avatar_url": main_avatar_url
        }
        
        supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        print(f"✅ Biometric Data Secured: {len(valid_images_data)} reference photos saved.")
        
        return {
            "status": "success",
            "message": "User registered successfully.",
            "user": {
                "id": user_id,
                "username": username,
                "avatar_url": main_avatar_url
            }
        }

    except Exception as e:
        print(f"❌ Save Error: {e}")
        if user_id: 
            supabase.auth.admin.delete_user(user_id)
        raise HTTPException(status_code=500, detail="Registration failed during image upload.")

# ==========================================
# 2. LOGIN API
# ==========================================
class LoginSchema(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(credentials: LoginSchema):
    try:
        ghost_email = f"{credentials.username.lower().strip()}@avaani.app"
        
        response = supabase.auth.sign_in_with_password({
            "email": ghost_email,
            "password": credentials.password
        })
        
        if not response.session:
            raise HTTPException(status_code=401, detail="Invalid username or password.")
            
        return {
            "status": "success",
            "access_token": response.session.access_token,
            "user": {
                "id": response.user.id,
                "username": response.user.user_metadata.get("username")
            }
        }

    except Exception as e:
        print(f"❌ Login Failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid username or password.")

# ==========================================
# 3. UTILITY
# ==========================================
@router.get("/check-username/{username}")
async def check_username(username: str):
    if username == "ping": return {"status": "ok"}
    try:
        clean_user = validate_username(username)
        await check_username_availability(clean_user)
        return {"available": True, "username": clean_user}
    except HTTPException as e:
        return {"available": False, "detail": e.detail}

# ==========================================
# 4. NEW: FACE SYNC API (Camera-based face capture)
# ==========================================
@router.post("/sync-face")
async def sync_face(
    username: str = Form(...),
    password: str = Form(..., min_length=6)
):
    """
    Allows existing users to resync their face data using camera capture
    """
    print(f"🔄 Syncing face data for user: {username}")
    
    # Authenticate user first
    ghost_email = f"{username.lower().strip()}@avaani.app"
    try:
        response = supabase.auth.sign_in_with_password({
            "email": ghost_email,
            "password": password
        })
        user_id = response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    
    # Capture new face images
    print("📸 Opening camera for face sync...")
    try:
        captured_frames = capture_face_poses()
        print(f"✅ Captured {len(captured_frames)} face images for sync")
    except Exception as e:
        print(f"❌ Face capture failed: {e}")
        raise HTTPException(status_code=500, detail=f"Face capture failed: {str(e)}")

    # Convert frames to bytes
    try:
        valid_images_data = convert_frames_to_bytes(captured_frames)
        print(f"✅ Converted {len(valid_images_data)} frames to byte format")
    except Exception as e:
        print(f"❌ Frame conversion error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process captured images")

    # Upload new images and replace old ones
    try:
        main_avatar_url = ""
        
        # Delete old face images first (optional - comment out if you want to keep history)
        # This would require listing and deleting files in the user's folder
        
        # Upload new images
        for i, img_bytes in enumerate(valid_images_data):
            file_path = f"{user_id}/pose_{i}.jpg"
            
            supabase.storage.from_("faces").upload(
                file=img_bytes,
                path=file_path,
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )
            
            if i == 0:
                main_avatar_url = supabase.storage.from_("faces").get_public_url(file_path)

        # Update profile with new avatar URL
        update_data = {
            "avatar_url": main_avatar_url
        }
        
        supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        print(f"✅ Face data synced: {len(valid_images_data)} new reference photos saved.")
        
        return {
            "status": "success",
            "message": "Face data synced successfully.",
            "user": {
                "id": user_id,
                "username": username,
                "avatar_url": main_avatar_url
            }
        }

    except Exception as e:
        print(f"❌ Sync Error: {e}")
        raise HTTPException(status_code=500, detail="Face sync failed during image upload.")