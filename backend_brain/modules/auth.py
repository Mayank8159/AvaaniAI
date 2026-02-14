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

# Load OpenCV Face Detector (Server-Side Validation)
try:
    FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
except Exception as e:
    print(f"⚠️ Warning: Could not load Haar Cascade. {e}")

# ==========================================
# UTILITIES
# ==========================================
def validate_username(username: str):
    username = username.lower().strip()
    if not re.match(r"^[a-z0-9_]{3,20}$", username):
        raise HTTPException(
            status_code=400, 
            detail="Username must be 3-20 characters, lowercase letters, numbers, or underscores only."
        )
    return username

async def check_username_availability(username: str):
    try:
        response = supabase.table("profiles").select("username").eq("username", username).execute()
        if response.data and len(response.data) > 0:
            raise HTTPException(status_code=409, detail=f"Username '{username}' is already taken.")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"⚠️ DB Check Warning: {e}")

def validate_uploaded_images(images: List[UploadFile]):
    """
    Reads uploaded files, checks for faces, and returns the raw bytes.
    """
    valid_images_data = []
    
    if len(images) < 5:
        raise HTTPException(status_code=400, detail="Registration requires exactly 5 face angles.")

    for idx, img_file in enumerate(images):
        try:
            # Read bytes
            img_file.file.seek(0)
            content = img_file.file.read()
            
            # Convert to OpenCV format for checking
            nparr = np.frombuffer(content, np.uint8)
            img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img_np is None:
                print(f"   ⚠️ Image {idx}: Corrupt or empty.")
                continue
            
            # Quick Face Check (Haar)
            gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
            faces = FACE_CASCADE.detectMultiScale(gray, 1.1, 5)
            
            if len(faces) > 0:
                valid_images_data.append(content)
            else:
                print(f"   ⚠️ Image {idx}: No face detected (Server Check).")
                # We typically still accept it if enough others are good, 
                # or you can enforce strictness here.
                valid_images_data.append(content) 

        except Exception as e:
            print(f"   ❌ Processing Error Image {idx}: {e}")

    if len(valid_images_data) < 3:
        raise HTTPException(
            status_code=400, 
            detail="Server could not detect faces in at least 3 photos. Please try again."
        )
        
    return valid_images_data

# ==========================================
# 1. SIGNUP API (Receives Files from Client)
# ==========================================
@router.post("/signup", status_code=201)
async def signup(
    username: str = Form(...),
    password: str = Form(..., min_length=6),
    full_name: str = Form(...),
    images: List[UploadFile] = File(...) 
):
    print(f"📝 Starting Registration: {username}")

    # --- STEP 1: VALIDATION ---
    username = validate_username(username)
    await check_username_availability(username)

    # --- STEP 2: PROCESS IMAGES ---
    # We verify the images sent by the client contain faces
    valid_images_data = validate_uploaded_images(images)

    # --- STEP 3: CREATE SUPABASE USER ---
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

    # --- STEP 4: UPLOAD TO STORAGE ---
    try:
        main_avatar_url = ""
        
        for i, img_bytes in enumerate(valid_images_data):
            # Naming convention: pose_0 (front), pose_1 (left), etc.
            file_path = f"{user_id}/pose_{i}.jpg"
            
            supabase.storage.from_("faces").upload(
                file=img_bytes,
                path=file_path,
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )
            
            if i == 0:
                main_avatar_url = supabase.storage.from_("faces").get_public_url(file_path)

        # Update Profile with Avatar
        update_data = {"avatar_url": main_avatar_url}
        supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        print(f"✅ Biometrics Secured for {username}")
        
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
        raise HTTPException(status_code=500, detail="Registration failed during storage.")

# ==========================================
# 2. SYNC FACE API (Update existing user)
# ==========================================
@router.post("/sync-face")
async def sync_face(
    username: str = Form(...),
    password: str = Form(...),
    images: List[UploadFile] = File(...)
):
    """
    Updates the biometric photos for an existing user.
    """
    print(f"🔄 Syncing face data for: {username}")
    
    # 1. Authenticate
    ghost_email = f"{username.lower().strip()}@avaani.app"
    try:
        response = supabase.auth.sign_in_with_password({
            "email": ghost_email,
            "password": password
        })
        if not response.session: raise Exception("Auth failed")
        user_id = response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    # 2. Validate Images
    valid_images_data = validate_uploaded_images(images)

    # 3. Overwrite Storage
    try:
        main_avatar_url = ""
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
        supabase.table("profiles").update({"avatar_url": main_avatar_url}).eq("id", user_id).execute()
        
        return {"status": "success", "message": "Biometrics updated."}

    except Exception as e:
        print(f"❌ Sync Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update face data.")

# ==========================================
# 3. LOGIN API
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
            raise HTTPException(status_code=401, detail="Invalid login.")
            
        return {
            "status": "success",
            "access_token": response.session.access_token,
            "user": {
                "id": response.user.id,
                "username": response.user.user_metadata.get("username")
            }
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

# ==========================================
# 4. UTILITY
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