import cv2
import mediapipe as mp
import threading
import time
import numpy as np
import os
import math
from collections import deque, Counter
from ultralytics import YOLO
from deepface import DeepFace
from deepface.commons import distance as dst # For manual vector comparison

# ==========================================
# CONFIGURATION
# ==========================================
HOLDING_LATCH_FRAMES = 12
IOU_THRESHOLD = 0.15
EMOTION_TEMPERATURE = 0.65

# Identity Thresholds (VGG-Face uses Cosine Similarity)
# 0.40 is standard, lower is stricter
IDENTITY_THRESHOLD = 0.40 

ALLOWED_CLASSES_FOR_HOLDING = {
    'backpack', 'handbag', 'suitcase', 'tie', 'cell phone', 'laptop', 'mouse', 
    'remote', 'keyboard', 'book', 'bottle', 'cup', 'fork', 'knife', 'spoon', 
    'bowl', 'wine glass', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 
    'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'scissors', 'teddy bear', 
    'hair drier', 'toothbrush', 'vase', 'clock', 'pen', 'marker'
}

HOME_CONTEXT_CLASSES = ALLOWED_CLASSES_FOR_HOLDING.union({
    'person', 'bicycle', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 
    'toilet', 'tv', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator'
})

# ==========================================
# GESTURE ENGINE
# ==========================================
class GestureEngine:
    def __init__(self):
        self.history = deque(maxlen=5)

    def analyze(self, hand_landmarks, img_shape):
        if not hand_landmarks: return []
        h, w, _ = img_shape
        lm = hand_landmarks.landmark
        
        thumb = self._get_thumb_curl(lm, w, h)
        index = self._get_finger_curl(lm, 5, 6, 7, 8)
        middle = self._get_finger_curl(lm, 9, 10, 11, 12)
        ring = self._get_finger_curl(lm, 13, 14, 15, 16)
        pinky = self._get_finger_curl(lm, 17, 18, 19, 20)

        gestures = []
        if index < 0.4 and middle < 0.4 and ring < 0.4 and pinky < 0.4 and thumb < 0.4:
            gestures.append("open_palm")
        elif index > 0.8 and middle > 0.8 and ring > 0.8 and pinky > 0.8:
            gestures.append("fist")
        elif index < 0.4 and middle < 0.4 and ring > 0.8 and pinky > 0.8:
            gestures.append("peace")
        elif index < 0.4 and middle > 0.8 and ring > 0.8 and pinky > 0.8:
            gestures.append("pointing")
        elif thumb < 0.4 and index > 0.8 and middle > 0.8 and ring > 0.8 and pinky > 0.8:
            if lm[4].y < lm[5].y: gestures.append("thumbs_up")
            else: gestures.append("fist")
        else:
            gestures.append("active_hand")

        self.history.append(gestures)
        flat = [g for sub in self.history for g in sub]
        if flat: return [Counter(flat).most_common(1)[0][0]]
        return ["active_hand"]

    def _get_finger_curl(self, lm, pip, mcp, dip, tip):
        v1 = np.array([lm[mcp].x - lm[pip].x, lm[mcp].y - lm[pip].y, lm[mcp].z - lm[pip].z])
        v2 = np.array([lm[tip].x - lm[dip].x, lm[tip].y - lm[dip].y, lm[tip].z - lm[dip].z])
        if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0: return 1.0
        cos_angle = np.clip(np.dot(v1/np.linalg.norm(v1), v2/np.linalg.norm(v2)), -1.0, 1.0)
        return (np.pi - np.arccos(cos_angle)) / np.pi 

    def _get_thumb_curl(self, lm, w, h):
        dist = np.hypot((lm[4].x - lm[17].x)*w, (lm[4].y - lm[17].y)*h)
        palm_width = np.hypot((lm[5].x - lm[17].x)*w, (lm[5].y - lm[17].y)*h)
        return 1.0 - min(dist / (palm_width * 1.5), 1.0)

# ==========================================
# EMOTION ENGINE
# ==========================================
class EmotionEngine:
    def __init__(self):
        self.emotion_history = deque(maxlen=8)
        self.movement_history = deque(maxlen=5) 
        
    def process(self, deepface_result, gaze_score, posture_data, attention_score, face_landmarks):
        raw_probs = self._extract_raw_probs(deepface_result)
        
        fear = raw_probs.pop('fear', 0.0)
        raw_probs['neutral'] += fear * 0.5
        raw_probs['surprise'] += fear * 0.3
        raw_probs['sad'] += fear * 0.2
        
        total = sum(raw_probs.values())
        core_probs = {k: v/total for k, v in raw_probs.items()}
        
        energy = self._calculate_energy(face_landmarks, posture_data)
        state_probs = self._derive_states(core_probs, gaze_score, posture_data, attention_score, energy)
        unified = self._merge_emotions_and_states(core_probs, state_probs)
        
        self.emotion_history.append(unified)
        final_probs = self._temporal_smooth()
        dominant = max(final_probs, key=final_probs.get)
        
        entropy = -sum(p * math.log(p + 1e-9) for p in final_probs.values())
        max_entropy = math.log(len(final_probs))
        intensity = 1.0 - (entropy / max_entropy)

        sorted_probs = sorted(final_probs.values(), reverse=True)
        confidence = sorted_probs[0] - (sorted_probs[1] if len(sorted_probs) > 1 else 0)

        return {
            'dominant': dominant,
            'intensity': float(round(intensity, 2)),
            'confidence': float(round(confidence, 2)),
            'energy': float(round(energy, 2)),
            'probabilities': {k: float(round(v, 3)) for k, v in final_probs.items()}
        }

    def _extract_raw_probs(self, result):
        if not result: return {e: 0.16 for e in ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']}
        raw = result[0]['emotion']
        total = sum(raw.values())
        return {k.lower(): v/total for k, v in raw.items()}

    def _calculate_energy(self, landmarks, posture_data):
        curr_nose = np.array([landmarks[1].x, landmarks[1].y])
        if len(self.movement_history) > 0:
            dist = np.linalg.norm(curr_nose - self.movement_history[-1])
            kinetic = np.clip(dist * 20, 0, 1) 
        else:
            kinetic = 0.0
        self.movement_history.append(curr_nose)
        postural = posture_data.get('energy', 0.5)
        
        left_eye_h = abs(landmarks[159].y - landmarks[145].y) * 100
        right_eye_h = abs(landmarks[386].y - landmarks[374].y) * 100
        facial = np.clip((left_eye_h + right_eye_h) / 2.0, 0.0, 1.0)
        
        return (kinetic * 0.4) + (postural * 0.3) + (facial * 0.3)

    def _derive_states(self, core, gaze, posture, attention, energy):
        states = {}
        states['calm'] = (core['neutral'] + core['happy']) * 0.5 * (1.0 - energy)
        states['excited'] = (core['happy'] + core['surprise']) * 0.5 * energy
        slouch = posture.get('inclination', 0)
        states['tired'] = (core['sad'] + core['neutral']) * 0.5 * (1.0 - energy) * (1.0 + slouch)
        total = sum(states.values())
        if total == 0: return {k: 0.33 for k in states}
        return {k: v/total for k, v in states.items()}

    def _merge_emotions_and_states(self, core, state):
        unified = {}
        for k, v in core.items(): unified[k] = v * 0.7
        for k, v in state.items(): unified[k] = v * 0.3
        logits = {k: math.log(max(v, 1e-9)) / EMOTION_TEMPERATURE for k, v in unified.items()}
        exp_sum = sum(math.exp(l) for l in logits.values())
        return {k: math.exp(v)/exp_sum for k, v in logits.items()}

    def _temporal_smooth(self):
        if not self.emotion_history: return {}
        smoothed = {k: 0.0 for k in self.emotion_history[0]}
        weights = [math.exp(i * 0.5) for i in range(len(self.emotion_history))]
        total_w = sum(weights)
        for i, frame_probs in enumerate(self.emotion_history):
            w = weights[i] / total_w
            for k, v in frame_probs.items():
                smoothed[k] += v * w
        return smoothed

# ==========================================
# VISION SYSTEM (CORE)
# ==========================================
class VisionSystem:
    def __init__(self):
        print("👁️ Initializing Avaani Vision (Production Mode)...")
        
        # 1. Load Mediapipe
        self.mp_face = mp.solutions.face_mesh.FaceMesh(refine_landmarks=True, max_num_faces=1)
        self.mp_hands = mp.solutions.hands.Hands(max_num_hands=2, min_detection_confidence=0.5)
        self.mp_pose = mp.solutions.pose.Pose(min_detection_confidence=0.5)
        
        # 2. Load YOLO
        try:
            self.yolo = YOLO("models/yolov8m.pt") 
        except:
            print("⚠️ Local YOLO model not found, downloading...")
            self.yolo = YOLO("yolov8m.pt")
        
        # 3. Engines
        self.gesture_engine = GestureEngine()
        self.emotion_engine = EmotionEngine()
        
        # 4. State
        self.lock = threading.Lock()
        self.running = True
        self.latest_frame = None
        self.collision_counters = {}
        self.latched_objects = set()
        self._current_landmarks = None
        self._current_metrics = {}
        
        # 5. Identity Memory (No Disk Storage)
        self.active_username = "Stranger"
        self.known_embeddings = [] # List of vectors
        
        # 6. Context Packet
        self.context = {
            "identity": "Stranger",
            "emotion": "neutral",
            "emotion_intensity": 0.0,
            "state_confidence": 0.0,
            "energy_level": 0.5,
            "attention": 0.0,
            "engagement": 0.0,
            "gaze": {"score": 0.0, "vector": "averted"},
            "tracking": {"x": 0.5, "y": 0.5, "z": 0.5, "visible": False},
            "posture": {"inclination": 0.0, "facing_camera": False, "energy": 0.5},
            "gestures": [],
            "holding": [],
            "surroundings": [],
            "timestamp": time.time(),
            "system_status": "active"
        }

        # 7. Start Background Workers
        self.yolo_thread = threading.Thread(target=self._yolo_worker, daemon=True)
        self.identity_thread = threading.Thread(target=self._identity_worker, daemon=True)
        self.emotion_thread = threading.Thread(target=self._emotion_worker, daemon=True)
        
        self.yolo_thread.start()
        self.identity_thread.start()
        self.emotion_thread.start()
        print(f"✅ Vision Active. Mode: In-Memory Verification")

    def load_user_into_memory(self, supabase_client, user_id, username):
        """
        Called by Server.py after login.
        Downloads reference images, generates embeddings immediately, and stores in RAM.
        No files are saved to the server disk.
        """
        print(f"📡 Downloading Biometrics for: {username}...")
        embeddings = []
        
        for i in range(5):
            try:
                # 1. Download bytes from Supabase
                data = supabase_client.storage.from_("faces").download(f"{user_id}/pose_{i}.jpg")
                
                # 2. Convert to OpenCV Image
                nparr = np.frombuffer(data, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img is None: continue

                # 3. Generate Embedding (VGG-Face)
                # enforce_detection=False handles side profiles where face might be partial
                embedding_obj = DeepFace.represent(
                    img_path=img, 
                    model_name="VGG-Face", 
                    enforce_detection=False
                )
                
                if embedding_obj:
                    embeddings.append(embedding_obj[0]["embedding"])
                    
            except Exception as e:
                # print(f"⚠️ Failed to process pose_{i}: {e}")
                continue
        
        # Update State
        with self.lock:
            self.known_embeddings = embeddings
            self.active_username = username
            
        print(f"✅ Loaded {len(embeddings)} face vectors for {username} into RAM.")

    def process_frame(self, frame):
        """Main entry point for Server.py"""
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # --- 1. FACE & GAZE ---
        face_res = self.mp_face.process(rgb)
        if face_res.multi_face_landmarks:
            lm = face_res.multi_face_landmarks[0].landmark
            nose = lm[1]
            eye_dist = np.sqrt((lm[33].x - lm[263].x)**2 + (lm[33].y - lm[263].y)**2)
            z_raw = np.clip(1.0 - (eye_dist * 4.5), 0.0, 1.0)
            gaze_score = np.clip(1.0 - (abs(nose.x - 0.5) * 2.5), 0.0, 1.0)
            
            self.context["tracking"] = {"x": round(nose.x, 3), "y": round(nose.y, 3), "z": round(z_raw, 3), "visible": True}
            self.context["gaze"] = {"score": round(gaze_score, 2), "vector": "direct" if gaze_score > 0.6 else "averted"}
            self._current_landmarks = lm
        else:
            self.context["tracking"]["visible"] = False
            self._current_landmarks = None

        # --- 2. POSE ---
        pose_res = self.mp_pose.process(rgb)
        posture_score = 0.4
        posture_data = {"inclination": 0.0, "facing_camera": False, "energy": 0.5}
        if pose_res.pose_landmarks:
            plm = pose_res.pose_landmarks.landmark
            shoulder_z_diff = abs(plm[11].z - plm[12].z)
            facing = shoulder_z_diff < 0.15
            posture_score = 1.0 if facing else 0.4
            ms_y = (plm[11].y + plm[12].y) / 2
            mh_y = (plm[23].y + plm[24].y) / 2
            spine_len = abs(mh_y - ms_y)
            pos_energy = np.clip(spine_len * 2.5, 0.2, 1.0) 
            posture_data = {"inclination": round(shoulder_z_diff, 2), "facing_camera": facing, "energy": round(pos_energy, 2)}
            self.context["posture"] = posture_data

        # --- 3. HANDS & HOLDING ---
        hand_res = self.mp_hands.process(rgb)
        gestures = []
        hand_bboxes = []
        if hand_res.multi_hand_landmarks:
            for hand_lms in hand_res.multi_hand_landmarks:
                g_list = self.gesture_engine.analyze(hand_lms, frame.shape)
                gestures.extend(g_list)
                xs = [l.x * w for l in hand_lms.landmark]
                ys = [l.y * h for l in hand_lms.landmark]
                pad = 30
                hx1, hy1, hx2, hy2 = min(xs)-pad, min(ys)-pad, max(xs)+pad, max(ys)+pad
                hand_bboxes.append((hx1, hy1, hx2, hy2))
            
            with self.lock: yolo_boxes = self.context.get("_yolo_boxes", [])
            for obj_name, ox1, oy1, ox2, oy2 in yolo_boxes:
                if obj_name not in ALLOWED_CLASSES_FOR_HOLDING: continue
                is_colliding = False
                for hx1, hy1, hx2, hy2 in hand_bboxes:
                    if not (ox1 > hx2 or ox2 < hx1 or oy1 > hy2 or oy2 < hy1):
                        ix1, iy1 = max(hx1, ox1), max(hy1, oy1)
                        ix2, iy2 = min(hx2, ox2), min(hy2, oy2)
                        inter_area = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                        hand_area = (hx2 - hx1) * (hy2 - hy1)
                        if hand_area > 0 and (inter_area / hand_area) > IOU_THRESHOLD:
                            is_colliding = True
                            break
                if is_colliding:
                    self.collision_counters[obj_name] = self.collision_counters.get(obj_name, 0) + 1
                    if self.collision_counters[obj_name] >= HOLDING_LATCH_FRAMES:
                        self.latched_objects.add(obj_name)
                else:
                    if obj_name in self.collision_counters:
                        self.collision_counters[obj_name] -= 1
                        if self.collision_counters[obj_name] <= 0:
                            del self.collision_counters[obj_name]
                            self.latched_objects.discard(obj_name)
        else:
            self.collision_counters.clear()
            self.latched_objects.clear()

        self.context["gestures"] = list(set(gestures))
        self.context["holding"] = [obj for obj in self.latched_objects if self.collision_counters.get(obj, 0) > 0]

        # --- 4. ATTENTION ---
        att_gaze = self.context["gaze"]["score"]
        attention = (att_gaze * 0.6) + (posture_score * 0.4)
        engagement = (attention * 0.7) + (0.3 if len(gestures) > 0 else 0.0)
        self.context["attention"] = float(round(np.clip(attention, 0, 1.0), 2))
        self.context["engagement"] = float(round(np.clip(engagement, 0, 1.0), 2))
        
        self._current_metrics = {'gaze': att_gaze, 'posture': posture_data, 'attention': attention}
        
        with self.lock: 
            self.latest_frame = frame.copy()
        return frame

    def get_context_json(self):
        return {k: v for k, v in self.context.items() if not k.startswith('_')}

    def _yolo_worker(self):
        while self.running:
            if self.latest_frame is None: time.sleep(0.01); continue
            with self.lock: frame = self.latest_frame.copy()
            try:
                results = self.yolo(frame, verbose=False, conf=0.5)
                boxes = []
                surroundings = set()
                for r in results:
                    for box in r.boxes:
                        name = self.yolo.names[int(box.cls[0])]
                        if name in HOME_CONTEXT_CLASSES:
                            surroundings.add(name)
                            if name in ALLOWED_CLASSES_FOR_HOLDING:
                                b = box.xyxy[0].cpu().numpy()
                                boxes.append((name, b[0], b[1], b[2], b[3]))
                self.context["surroundings"] = list(surroundings)
                self.context["_yolo_boxes"] = boxes
            except: pass
            time.sleep(0.033)

    def _identity_worker(self):
        """
        Compares live frame embedding against in-memory user embeddings.
        No disk IO.
        """
        while self.running:
            if self.latest_frame is None or self._current_landmarks is None:
                time.sleep(0.05); continue
            
            # If no user is logged in/loaded, we can't match
            if not self.known_embeddings:
                self.context["identity"] = "Stranger"
                time.sleep(1.0)
                continue

            with self.lock: frame = self.latest_frame.copy()
            
            try:
                # 1. Get embedding of current frame
                current_emb_obj = DeepFace.represent(
                    frame, 
                    model_name="VGG-Face", 
                    enforce_detection=False
                )
                
                if not current_emb_obj:
                    self.context["identity"] = "Unknown"
                    time.sleep(0.1)
                    continue

                curr_emb = current_emb_obj[0]["embedding"]
                
                # 2. Match against known memory
                is_match = False
                for auth_emb in self.known_embeddings:
                    # Calculate Cosine Distance
                    distance = dst.findCosineDistance(curr_emb, auth_emb)
                    if distance < IDENTITY_THRESHOLD:
                        is_match = True
                        break
                
                self.context["identity"] = self.active_username if is_match else "Stranger"

            except Exception: 
                pass

            time.sleep(0.1) # Check identity 10 times/sec

    def _emotion_worker(self):
        while self.running:
            if self.latest_frame is None or self._current_landmarks is None:
                time.sleep(0.05); continue
            with self.lock: frame = self.latest_frame.copy()
            metrics = getattr(self, '_current_metrics', {})
            landmarks = self._current_landmarks
            try:
                analysis = DeepFace.analyze(frame, actions=['emotion'], enforce_detection=False, silent=True)
                emo_res = self.emotion_engine.process(
                    analysis, metrics.get('gaze', 0.5), metrics.get('posture', {}), 
                    metrics.get('attention', 0.5), landmarks
                )
                self.context.update({
                    "emotion": emo_res['dominant'],
                    "emotion_intensity": emo_res['intensity'],
                    "state_confidence": emo_res['confidence'],
                    "energy_level": emo_res['energy'],
                    "emotion_probs": emo_res['probabilities']
                })
            except Exception: pass
            time.sleep(0.05)

    def stop(self):
        self.running = False
        self.yolo_thread.join()
        self.identity_thread.join()
        self.emotion_thread.join()