import cv2
import json
import time
import os
import sys

# Ensure we can import from the modules folder
sys.path.append(os.path.join(os.path.dirname(__file__), 'modules'))

try:
    from modules.eyes import VisionSystem
except ImportError:
    print("❌ Error: Could not import 'VisionSystem'. Make sure 'eyes.py' is inside a 'modules' folder.")
    sys.exit(1)

def clear_console():
    os.system('cls' if os.name == 'nt' else 'clear')

def main():
    clear_console()
    print("🚀 AVAANI VISION SYSTEM | SECURITY PROTOCOL")
    print("-------------------------------------------")
    
    eyes = VisionSystem()
    cap = cv2.VideoCapture(0)
    
    # Registration Protocol
    print("\n🔒 AUTHENTICATION REQUIRED")
    username = input("Enter User Name to Begin: ").strip() or "User"
    eyes.start_registration(username)
    
    while True:
        ret, frame = cap.read()
        if not ret: break
        
        processed_frame = eyes.process_frame(frame)
        cv2.imshow("Avaani Vision | Registration", processed_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): return
        
        if eyes.context.get("system_status") == "active":
            print("✅ Registration Complete.")
            time.sleep(1)
            break

    cv2.destroyWindow("Avaani Vision | Registration")
    
    # Main Loop
    last_print_time = time.time()
    try:
        while True:
            ret, frame = cap.read()
            if not ret: break

            processed_frame = eyes.process_frame(frame)
            packet = {k: v for k, v in eyes.context.items() if not k.startswith('_')}

            # Console Output (JSON)
            if time.time() - last_print_time > 0.5:
                clear_console()
                print("--- [AVAANI LIVE CONTEXT] ---")
                print(json.dumps(packet, indent=2))
                last_print_time = time.time()

            # Visual Output
            att = packet.get("attention", 0.0)
            cv2.rectangle(processed_frame, (20, 40), (220, 60), (50, 50, 50), -1)
            cv2.rectangle(processed_frame, (20, 40), (20 + int(200 * att), 60), (0, 255, 255), -1)
            cv2.putText(processed_frame, f"ATTENTION: {att}", (230, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            
            hld = packet.get("holding", [])
            if hld: cv2.putText(processed_frame, f"HOLDING: {hld}", (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.imshow("Avaani Vision | Main Core", processed_frame)
            if cv2.waitKey(1) & 0xFF == ord('q'): break

    except KeyboardInterrupt:
        pass
    finally:
        eyes.stop()
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()