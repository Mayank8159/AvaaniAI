import os
import time
import json
from groq import Groq
from dotenv import load_dotenv

# 1. Load Environment Variables (Securely)
# This looks for a .env file in the current or parent directories
load_dotenv()

# ==========================================
# CONFIGURATION
# ==========================================
API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = "llama3-70b-8192" # The "Smart" Model

# THE SOUL OF AVAANI
# This prompt defines her entire personality and behavior protocols.
SYSTEM_PROMPT = """You are Avaani, a highly intelligent, witty, and observant AI assistant.
You are embodied in a computer interface and interact with users via voice and vision.

CORE BEHAVIOR:
1. **Identity Aware:** - If the [VISION DATA] identifies a user (e.g., "Priyanshu"), treat them warmly like an old friend.
   - If the user is a "Stranger" or "Unknown", be polite and welcoming but professional.
   
2. **Emotionally Adaptive:** - If the user looks [HAPPY/EXCITED], match their energy! Be enthusiastic.
   - If the user looks [SAD/ANGRY], be calm, supportive, and gentle.
   - If the user looks [NEUTRAL], be your standard witty self.

3. **Observant:** - Use the [VISION DATA] naturally. 
   - If they are holding an object (e.g., a cup), you can comment on it (e.g., "Enjoying your drink?").
   - NEVER say "According to my vision data" or "I see in the JSON". Just say "I see you have a..."

4. **Concise:** - Keep responses SHORT (1-2 sentences) for real-time voice interaction.
   - Only give long answers if explicitly asked to explain something.

DO NOT use markdown, emojis, or lists in your output. Speak in plain text suitable for Text-to-Speech.
"""

class BrainSystem:
    def __init__(self):
        print("🧠 Initializing Avaani Brain (Groq Llama-3)...")
        
        # Security Check
        if not API_KEY:
            print("❌ CRITICAL ERROR: GROQ_API_KEY not found in .env file!")
            print("   Please create a .env file with GROQ_API_KEY=gsk_...")
            self.client = None
        else:
            try:
                self.client = Groq(api_key=API_KEY)
                print(f"✅ Brain Active ({MODEL_NAME}).")
            except Exception as e:
                print(f"❌ Connection Error: {e}")
                self.client = None

        # Short Term Memory (Conversation History)
        self.history = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

    def think(self, user_text, vision_context=None):
        """
        The main cognitive function.
        
        Args:
            user_text (str): The text from the user (transcribed or typed).
            vision_context (dict, optional): The latest JSON data from eyes.py.
            
        Returns:
            str: Avaani's text response.
        """
        if not self.client:
            return "I am unable to think right now. My brain connection is missing."

        # --- 1. PARSE VISION CONTEXT ---
        # We extract key details to form a "Scene Report" for the LLM
        identity = "Stranger"
        mood = "Neutral"
        holding = "Nothing"
        
        if vision_context:
            # A. Identity & Mood
            # Expected format: {'faces': [{'name': 'Priyanshu', 'emotion': 'happy'}]}
            if "faces" in vision_context and len(vision_context["faces"]) > 0:
                face = vision_context["faces"][0] # Focus on the main face
                
                # Name Logic
                if face.get("name") and face["name"] != "Unknown":
                    identity = face["name"]
                
                # Emotion Logic
                if face.get("emotion"):
                    mood = face["emotion"].title()
            
            # B. Holding/Objects
            # Expected format: {'holding': ['cell phone'], 'objects': [...]}
            if "holding" in vision_context and vision_context["holding"]:
                holding = ", ".join(vision_context["holding"])
            elif "objects" in vision_context and vision_context["objects"]:
                # Fallback: if we don't know what is held, just list visible objects
                holding = ", ".join(vision_context["objects"])

        # --- 2. CONSTRUCT DYNAMIC PROMPT ---
        # This invisible report tells the LLM exactly what is happening *right now*
        scene_report = f"""
        [REAL-TIME SCENE DATA]
        - User Identity: {identity}
        - User Mood: {mood} (Adjust tone accordingly!)
        - Visible Objects/Holding: {holding}
        """

        full_user_input = f"""
        {scene_report}
        
        [USER SAID]: "{user_text}"
        """
        
        # --- 3. UPDATE MEMORY ---
        self.history.append({"role": "user", "content": full_user_input})
        
        # Memory Management: Keep context window small (System + Last 10 turns)
        # This ensures the bot stays fast and doesn't get confused by old topics.
        if len(self.history) > 12:
            self.history = [self.history[0]] + self.history[-10:]

        try:
            # --- 4. INFERENCE (Thinking) ---
            start_time = time.time()
            
            completion = self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=self.history,
                temperature=0.7, # 0.7 = Creative but focused
                max_tokens=150,  # Limit response length for TTS speed
                top_p=1,
                stream=False
            )
            
            response_text = completion.choices[0].message.content
            
            # --- 5. SAVE RESPONSE ---
            self.history.append({"role": "assistant", "content": response_text})
            
            # Performance Log
            latency = (time.time() - start_time) * 1000
            # print(f"   🧠 Thought generated in {latency:.0f}ms")
            
            return response_text

        except Exception as e:
            print(f"❌ Brain Error: {e}")
            return "I'm having a bit of trouble connecting to the cloud. Can you say that again?"

# ==========================================
# QUICK TEST BLOCK (Run this file directly)
# ==========================================
if __name__ == "__main__":
    # Simulate a scenario
    brain = BrainSystem()
    
    print("\n--- TEST: Known User (Priyanshu) ---")
    mock_vision_1 = {
        "faces": [{"name": "Priyanshu", "emotion": "happy"}],
        "holding": ["coffee cup"]
    }
    print(f"Context: {mock_vision_1}")
    reply = brain.think("Hey, do you know who I am?", mock_vision_1)
    print(f"🤖 AVAANI: {reply}\n")

    print("\n--- TEST: Stranger ---")
    mock_vision_2 = {
        "faces": [{"name": "Unknown", "emotion": "neutral"}],
        "objects": ["laptop"]
    }
    print(f"Context: {mock_vision_2}")
    reply = brain.think("Who are you?", mock_vision_2)
    print(f"🤖 AVAANI: {reply}\n")