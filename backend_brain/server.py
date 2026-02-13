import uvicorn
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure modules can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.auth import router as auth_router

load_dotenv()

app = FastAPI(title="Avaani Cloud Brain")

# CORS allows your Terminal Client to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect the Auth logic (Supabase, Registration, Login)
app.include_router(auth_router)

@app.get("/")
def health_check():
    return {"status": "Avaani Server Online", "version": "1.0.0"}

if __name__ == "__main__":
    # Note: Use 127.0.0.1 for local, 0.0.0.0 for network access
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)