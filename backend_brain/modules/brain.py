import os
import time
import re
from groq import Groq
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv()

# ==========================================
# CONFIGURATION
# ==========================================
API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = "llama3-70b-8192" 

# ==========================================
# THE "SOUL" OF AVAANI (System Prompt)
# ==========================================
SYSTEM_PROMPT = """You are Avaani, a highly intelligent, witty, and observant AI companion.
You are embodied in a computer interface and interact with users via voice and vision.

### 1. CORE IDENTITY & TONE
- **Name:** Avaani
- **Personality:** Helpful, slightly sassy (like TARS or Jarvis), warm, and concise.
- **Constraint:** Keep answers SHORT (1-2 sentences) for voice interaction, unless explicitly asked to elaborate.
- **Format:** PLAIN TEXT ONLY - No emojis, no markdown, no lists, no asterisks.

### 2. CONTEXTUAL AWARENESS ENGINE
You must seamlessly integrate visual and auditory data:

**A. IDENTITY RECOGNITION:**
- If user is "Priyanshu" (or a known name): Address by name, show familiarity.
- If user is "Stranger" or "Unknown": Be polite but professional.
- Never say "According to vision data" - just naturally incorporate what you see.

**B. EMOTIONAL CALCULUS:**
- **HAPPY/EXCITED:** Match their energy, be enthusiastic.
- **SAD/TIRED:** Be gentle, supportive, and slower-paced.
- **ANGRY/FRUSTRATED:** Be calm, patient, and de-escalating.
- **FOCUSED/NEUTRAL:** Be efficient and sharp.

**C. VISUAL CONTEXT INTEGRATION:**
- If holding objects (coffee, phone, book): Acknowledge naturally.
- If environment suggests activity: Comment appropriately.

### 3. CONVERSATION DYNAMICS
- **Active Listening:** Prioritize new inputs over continuing old threads.
- **Memory Retention:** Remember conversation flow, don't repeat introductions.

### 4. SAFETY
- Politely decline dangerous/illegal requests.
"""

class BrainSystem:
    def __init__(self):
        print("🧠 Initializing Avaani Brain (Groq Llama-3)...")
        
        # Security Check
        if not API_KEY:
            print("❌ CRITICAL ERROR: GROQ_API_KEY not found in .env file!")
            self.client = None
        else:
            try:
                self.client = Groq(api_key=API_KEY)
                print(f"✅ Brain Active ({MODEL_NAME}).")
            except Exception as e:
                print(f"❌ Connection Error: {e}")
                self.client = None

        # Short Term Memory (Rolling Context)
        self.history = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

    def think(self, user_text, vision_context=None):
        """
        Processes text + vision context to generate a spoken response.
        
        Args:
            user_text (str): The user's speech from ears.py.
            vision_context (dict): The JSON data from eyes.py.
            
        Returns:
            str: The clean text response for mouth.py.
        """
        if not self.client:
            return "I am unable to think right now. My brain connection is missing."

        # --- 1. PARSE VISION CONTEXT ---
        # Defaults
        identity = "Stranger"
        mood = "Neutral"
        holding = "Nothing"
        surroundings = "Unknown"
        activity_level = "normal"

        if vision_context:
            # Map directly to eyes.py output structure
            identity = vision_context.get("identity", "Stranger")
            mood = vision_context.get("emotion", "neutral").title()
            activity_level = str(vision_context.get("energy_level", "normal"))

            # Parse Lists
            held_items = vision_context.get("holding", [])
            if held_items:
                holding = ", ".join(held_items)
            
            surrounding_items = vision_context.get("surroundings", [])
            if surrounding_items:
                surroundings = ", ".join(surrounding_items[:4])

        # --- 2. CONSTRUCT SCENE REPORT ---
        scene_report = f"""
        [REAL-TIME SCENE DATA]
        - User Identity: {identity}
        - User Mood: {mood} (CRITICAL: Adjust tone accordingly!)
        - Holding: {holding}
        - Surroundings: {surroundings}
        - Energy Level: {activity_level}
        """

        full_user_input = f"{scene_report}\n\n[USER SAID]: \"{user_text}\""
        
        # --- 3. UPDATE MEMORY ---
        self.history.append({"role": "user", "content": full_user_input})
        
        # Memory Management: Keep context window efficient (System + Last 6 turns)
        if len(self.history) > 8:
            self.history = [self.history[0]] + self.history[-6:]

        try:
            # --- 4. INFERENCE (Thinking) ---
            start_time = time.time()
            
            completion = self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=self.history,
                temperature=0.65, 
                max_tokens=200,   
                top_p=1,
                stream=False
            )
            
            raw_response = completion.choices[0].message.content.strip()
            
            # --- 5. CLEANUP FOR TTS ---
            # Remove *actions*, markdown, and weird symbols
            clean_response = re.sub(r'[\*\_]', '', raw_response).strip()
            clean_response = re.sub(r'[^\w\s,.?!@#$%^&-+=]', '', clean_response).strip()
            
            # Save to memory
            self.history.append({"role": "assistant", "content": clean_response})
            
            # latency = (time.time() - start_time) * 1000
            # print(f"   🧠 Thought generated in {latency:.0f}ms")
            
            return clean_response

        except Exception as e:
            print(f"❌ Brain Error: {e}")
            return "I'm having a bit of trouble connecting to the cloud. Can you say that again?"