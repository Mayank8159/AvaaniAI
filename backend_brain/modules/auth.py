import os
import io
import re
import numpy as np
import face_recognition
from PIL import Image, UnidentifiedImageError
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
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Service Role Key needed!

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
router = APIRouter(prefix="/auth", tags=["Authentication"])

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
        # We query the profiles table which is public/accessible via service key
        response = supabase.table("profiles").select("username").eq("username", username).execute()
        if response.data and len(response.data) > 0:
            raise HTTPException(status_code=409, detail=f"Username '{username}' is already taken.")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"⚠️ DB Check Warning: {e}")

# ==========================================
# 1. USERNAME SIGNUP + BIOMETRIC REGISTRATION
# ==========================================
@router.post("/signup", status_code=201)
async def signup(
    username: str = Form(...),  # <--- Primary ID
    password: str = Form(..., min_length=6),
    full_name: str = Form(...),
    images: List[UploadFile] = File(...) # Multi-Angle Images
):
    """
    Username-Only Signup.
    1. Checks if username is unique.
    2. Processes 5 face angles -> Average Vector.
    3. Creates User (using hidden 'username@avaani.app' email).
    4. Saves images & profile.
    """
    print(f"📝 Starting Registration for User: {username}")

    # --- STEP 1: VALIDATION ---
    username = validate_username(username)
    await check_username_availability(username)

    # --- STEP 2: FACE PROCESSING (Multi-Angle) ---
    valid_encodings = []
    processed_images_data = [] 

    if len(images) < 3:
        raise HTTPException(status_code=400, detail="Please provide at least 3 face angles.")

    print(f"   Processing {len(images)} images...")

    for idx, img_file in enumerate(images):
        try:
            content = await img_file.read()
            processed_images_data.append(content)
            
            pil_image = Image.open(io.BytesIO(content)).convert("RGB")
            np_image = np.array(pil_image)
            
            # Using HOG for speed. (Use 'cnn' if you have GPU and dlib installed)
            face_locations = face_recognition.face_locations(np_image, model="hog")
            
            if len(face_locations) == 1:
                encoding = face_recognition.face_encodings(np_image, face_locations)[0]
                valid_encodings.append(encoding)
            else:
                print(f"   ⚠️ Image {idx}: Skipped (Face unclear/multiple).")

        except Exception as e:
            print(f"   ❌ Error Image {idx}: {e}")

    if len(valid_encodings) < 3:
        raise HTTPException(status_code=400, detail="Could not detect a clear face in at least 3 photos.")

    # Average the vectors for stability
    avg_encoding = np.mean(valid_encodings, axis=0).tolist()
    print(f"✅ Generated Master Face Profile.")

    # --- STEP 3: CREATE USER (Ghost Email Strategy) ---
    user_id = None
    # We construct a fake email because Supabase Auth requires one.
    # The user never sees this.
    ghost_email = f"{username}@avaani.app"

    try:
        attributes = {
            "email": ghost_email,
            "password": password,
            "email_confirm": True, # Auto-confirm so they can login immediately
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
        # If fake email exists, it means username is technically taken in Auth
        if "already registered" in str(e).lower():
             raise HTTPException(status_code=409, detail="Username is unavailable.")
        raise HTTPException(status_code=400, detail="Registration failed.")

    # --- STEP 4: SAVE IMAGES & PROFILE ---
    try:
        main_avatar_url = ""
        
        for i, img_bytes in enumerate(processed_images_data):
            file_path = f"{user_id}/pose_{i}.jpg"
            # Upload to 'faces' bucket
            supabase.storage.from_("faces").upload(
                file=img_bytes, path=file_path, file_options={"content-type": "image/jpeg", "upsert": "true"}
            )
            if i == 0:
                main_avatar_url = supabase.storage.from_("faces").get_public_url(file_path)

        # Update Profile (Row already created by Trigger)
        update_data = {
            "face_encoding": avg_encoding,
            "avatar_url": main_avatar_url
        }
        supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        print(f"✅ Profile Complete: {username}")
        
        return {
            "status": "success",
            "message": "User registered.",
            "user": {"id": user_id, "username": username, "avatar_url": main_avatar_url}
        }

    except Exception as e:
        print(f"❌ Save Error: {e}")
        if user_id: supabase.auth.admin.delete_user(user_id) # Rollback
        raise HTTPException(status_code=500, detail="Registration failed during save.")

# ==========================================
# 2. USERNAME LOGIN
# ==========================================
class LoginSchema(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(credentials: LoginSchema):
    """
    Logs in using Username + Password.
    (Internally converts username -> username@avaani.app)
    """
    try:
        # Reconstruct the ghost email
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
# 3. CHECK USERNAME (Public)
# ==========================================
@router.get("/check-username/{username}")
async def check_username(username: str):
    try:
        clean_user = validate_username(username)
        await check_username_availability(clean_user)
        return {"available": True, "username": clean_user}
    except HTTPException as e:
        return {"available": False, "detail": e.detail}