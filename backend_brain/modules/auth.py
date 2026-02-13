import os
import io
import re
import numpy as np
import face_recognition
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv()

# ==========================================
# CONFIGURATION & SETUP
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
# CRITICAL: Use Service Role Key for Admin privileges (Face Scan/User Management)
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") 

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

# Initialize Admin Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Create API Router
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
    Checks if username already exists in Supabase Profiles.
    """
    try:
        response = supabase.table("profiles").select("username").eq("username", username).execute()
        if response.data:
            raise HTTPException(status_code=409, detail=f"Username '{username}' is already taken.")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"⚠️ DB Check Error: {e}")
        # Proceed cautiously if DB check fails, SQL constraint will catch it later.

# ==========================================
# 1. SIGNUP + FACE REGISTRATION (Atomic)
# ==========================================
@router.post("/signup", status_code=201)
async def signup(
    email: EmailStr = Form(...),
    password: str = Form(..., min_length=6),
    username: str = Form(...),
    full_name: str = Form(...),
    image: UploadFile = File(...)
):
    """
    Production Signup Flow:
    1. Validate Input (Username format & uniqueness).
    2. Process Face (Ensure 1 face exists).
    3. Create User in Auth.
    4. Upload Avatar & Save Face Data.
    5. Rollback (Delete User) if step 4 fails.
    """
    print(f"📝 Starting Signup for: {email} ({username})")

    # --- STEP 1: VALIDATION ---
    username = validate_username(username)
    await check_username_availability(username)

    # --- STEP 2: FACE PROCESSING (Fail Early) ---
    face_vector = None
    image_bytes = None
    
    try:
        # Read file into memory
        image_bytes = await image.read()
        
        # Convert to Image object
        try:
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except UnidentifiedImageError:
            raise HTTPException(status_code=400, detail="Invalid image file format.")
            
        np_image = np.array(pil_image)
        
        # Scan for faces (HOG is faster, CNN is more accurate but requires GPU)
        # Using HOG for CPU production safety
        face_locations = face_recognition.face_locations(np_image, model="hog")
        
        if len(face_locations) == 0:
            raise HTTPException(status_code=400, detail="❌ No face detected. Please ensure good lighting and look at the camera.")
        
        if len(face_locations) > 1:
            raise HTTPException(status_code=400, detail="❌ Multiple faces detected. Registration requires a solo photo.")

        # Generate Encoding
        encodings = face_recognition.face_encodings(np_image, face_locations)
        face_vector = encodings[0].tolist()
        
        print("✅ Face Validated.")

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Face Logic Error: {e}")
        raise HTTPException(status_code=500, detail="Server error processing face data.")

    # --- STEP 3: CREATE USER (Auth) ---
    user_id = None
    try:
        # We use Admin API to create user to verify email availability immediately
        # (Standard sign_up also works, but admin gives more control)
        attributes = {
            "email": email,
            "password": password,
            "email_confirm": True, # Auto-confirm for smoother UX (Optional)
            "user_metadata": {
                "username": username,
                "full_name": full_name
            }
        }
        
        # Create User via Admin Client
        user_response = supabase.auth.admin.create_user(attributes)
        user_id = user_response.user.id
        print(f"✅ User Created: {user_id}")

    except Exception as e:
        # Supabase returns specific error messages usually
        print(f"❌ Auth Creation Error: {e}")
        if "already registered" in str(e).lower():
             raise HTTPException(status_code=409, detail="Email is already registered.")
        raise HTTPException(status_code=400, detail="Could not create user account.")

    # --- STEP 4: SAVE DATA (Atomic Transaction Simulation) ---
    try:
        # A. Upload Image
        file_ext = "jpg" # We converted to RGB, so we can save as jpg safely
        file_path = f"{user_id}/avatar.{file_ext}"
        
        supabase.storage.from_("faces").upload(
            file=image_bytes,
            path=file_path,
            file_options={"content-type": "image/jpeg", "upsert": "true"}
        )
        
        public_url = supabase.storage.from_("faces").get_public_url(file_path)
        
        # B. Update Profile
        # The profile row was auto-created by the SQL trigger. We just update the null fields.
        update_data = {
            "face_encoding": face_vector,
            "avatar_url": public_url
        }
        
        data = supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        print(f"✅ Registration Complete for {username}")
        
        return {
            "status": "success",
            "message": "User registered successfully",
            "user": {
                "id": user_id,
                "username": username,
                "avatar_url": public_url
            }
        }

    except Exception as e:
        print(f"❌ Critical Save Error: {e}")
        
        # --- ROLLBACK PROTOCOL ---
        # If saving the face fails, we MUST delete the Auth User, 
        # otherwise they can login but face recognition will crash.
        if user_id:
            print(f"⚠️ Rolling back: Deleting user {user_id}...")
            supabase.auth.admin.delete_user(user_id)
            
        raise HTTPException(status_code=500, detail="Account creation failed during data save. Please try again.")

# ==========================================
# 2. LOGIN (Standard)
# ==========================================
class LoginSchema(BaseModel):
    email: EmailStr
    password: str

@router.post("/login")
async def login(credentials: LoginSchema):
    """
    Standard Email/Password Login.
    Returns Access Token for WebSocket.
    """
    try:
        response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not response.session:
            raise HTTPException(status_code=401, detail="Invalid credentials.")
            
        return {
            "status": "success",
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "username": response.user.user_metadata.get("username")
            }
        }

    except Exception as e:
        print(f"❌ Login Failed: {e}")
        raise HTTPException(status_code=401, detail="Login failed. Check email and password.")

# ==========================================
# 3. UTILITY: CHECK USERNAME (For Frontend UI)
# ==========================================
@router.get("/check-username/{username}")
async def check_username(username: str):
    """
    API for frontend to show green checkmark if username is free.
    """
    try:
        clean_user = validate_username(username)
        await check_username_availability(clean_user)
        return {"available": True, "username": clean_user}
    except HTTPException as e:
        return {"available": False, "detail": e.detail}