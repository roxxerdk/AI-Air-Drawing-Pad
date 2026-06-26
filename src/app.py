"""Application orchestration for AI Air Drawing Pad.

This module wires the camera -> tracker -> gesture detector -> canvas
pipeline and runs a simple OpenCV display loop. Components are kept
lightweight and raise informative errors if required optional
dependencies are missing. It also streams raw camera frames and hand
coordinates to the frontend React UI via WebSockets.
"""

import logging
import base64
import json
import threading
import time
import asyncio
from typing import Optional

import websockets

from .camera import Camera
from .finger_detector import FingerDetector
from .hand_tracker import HandTracker
from .gesture_detector import GestureDetector
from .drawing_canvas import DrawingCanvas


# --- WebSocket Server Thread Settings ---
CONNECTED_CLIENTS = set()
loop = None

async def register(websocket):
    CONNECTED_CLIENTS.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        CONNECTED_CLIENTS.remove(websocket)

async def start_server():
    global loop
    loop = asyncio.get_running_loop()
    async with websockets.serve(register, "localhost", 8765):
        await asyncio.Future()  # run forever

def run_ws_server():
    asyncio.run(start_server())


def run(headless: bool = True) -> int:
    logging.info("App.run(headless=%s)", headless)

    camera = Camera()
    tracker = HandTracker()
    finger_detector = FingerDetector()
    detector = GestureDetector()
    canvas = DrawingCanvas()

    # Spawn WebSocket server thread - always run it so web frontend can connect
    ws_thread = threading.Thread(target=run_ws_server, daemon=True)
    ws_thread.start()
    logging.info("Spawned WebSocket server on ws://localhost:8765")

    # Determine if we should fall back to simulator
    use_simulator = False
    if headless:
        logging.info("Headless mode: starting camera simulation loop")
        use_simulator = True
    else:
        try:
            camera.start()
        except Exception as exc:
            logging.warning("Camera failed to start: %s. Falling back to Python simulator.", exc)
            use_simulator = True

    # Main loop
    try:
        t_sim = 0.0
        while True:
            if use_simulator:
                # Sleep to match 30 FPS
                time.sleep(1/30)
                t_sim += 0.03

                import numpy as np
                # Create a black frame context
                frame = np.zeros((720, 1280, 3), dtype=np.uint8)
                
                # Draw background diagnostic details
                cv2_imported = False
                try:
                    import cv2
                    cv2_imported = True
                    cv2.putText(frame, "PYTHON AI ENGINE (SIMULATOR)", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (99, 102, 241), 2)
                    cv2.putText(frame, f"Clients: {len(CONNECTED_CLIENTS)}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (94, 163, 184), 1)
                except Exception:
                    pass

                # Traces mathematical Lissajous curve
                cx = int(640 + np.sin(t_sim * 1.5) * 300)
                cy = int(360 + np.sin(t_sim * 3.0) * 200)

                # Generate 21 landmarks
                landmarks = [(cx, cy + 160)] # wrist
                # Thumb
                landmarks.append((cx - 40, cy + 120))
                landmarks.append((cx - 65, cy + 85))
                landmarks.append((cx - 75, cy + 55))
                landmarks.append((cx - 80, cy + 30))
                # Index
                landmarks.append((cx - 25, cy + 60))
                landmarks.append((cx - 30, cy + 15))
                landmarks.append((cx - 30, cy - 20))
                landmarks.append((cx - 30, cy - 50)) # tip
                # Middle
                landmarks.append((cx, cy + 60))
                landmarks.append((cx, cy + 10))
                landmarks.append((cx, cy - 20))
                landmarks.append((cx, cy - 55))
                # Ring
                landmarks.append((cx + 25, cy + 65))
                landmarks.append((cx + 25, cy + 15))
                landmarks.append((cx + 25, cy - 15))
                landmarks.append((cx + 25, cy - 50))
                # Pinky
                landmarks.append((cx + 50, cy + 75))
                landmarks.append((cx + 55, cy + 35))
                landmarks.append((cx + 55, cy + 10))
                landmarks.append((cx + 55, cy - 35))

                factor = np.sin(t_sim * 0.8)
                if factor <= -0.5:
                    gesture = "move"
                else:
                    gesture = "draw"

                states = finger_detector.detect(landmarks)
            else:
                ok, frame = camera.read()
                if not ok or frame is None:
                    logging.warning("Empty frame received, stopping")
                    break

                landmarks = None
                try:
                    landmarks = tracker.process(frame)
                except Exception as e:
                    logging.error("Tracker Error: %s", e)
                    raise

                try:
                    states = finger_detector.detect(landmarks)
                except Exception:
                    states = None

                gesture = detector.detect(states)

            # Update drawing canvas coordinates
            canvas.update(gesture, landmarks, states)

            try:
                out = canvas.render_on(frame)
            except Exception:
                out = frame

            # --- WebSocket Frame & Telemetry Broadcaster ---
            payload = {
                "type": "FRAME_UPDATE",
                "hand_detected": landmarks is not None,
                "landmarks": [{"x": x, "y": y} for x, y in landmarks] if landmarks else None,
                "gesture": gesture.upper() if gesture else "MOVE",
                "fingerStates": states.as_dict() if states else {
                    "thumb": False, "index": False, "middle": False, "ring": False, "pinky": False
                }
            }

            # Append normalized landmarks from 0 to 1 for responsive canvas rendering
            if landmarks and frame is not None:
                h_f, w_f = frame.shape[:2]
                payload["landmarks_normalized"] = [{"x": x / w_f, "y": y / h_f} for x, y in landmarks]

            # Compress frame to JPEG and encode to base64
            if frame is not None:
                try:
                    import cv2
                    _, buffer = cv2.imencode('.jpg', frame)
                    jpeg_base64 = base64.b64encode(buffer).decode('utf-8')
                    payload["frame"] = "data:image/jpeg;base64," + jpeg_base64
                except Exception as e:
                    logging.error("JPEG base64 encoding failed: %s", e)

            # Thread-safe broadcast
            if CONNECTED_CLIENTS and loop:
                message = json.dumps(payload)
                for client in list(CONNECTED_CLIENTS):
                    asyncio.run_coroutine_threadsafe(client.send(message), loop)

            # Show local OpenCV window (if not in headless mode)
            if not headless and not use_simulator:
                try:
                    import cv2

                    cv2.imshow("AI Air Drawing Pad", out)
                    key = cv2.waitKey(1) & 0xFF
                    # Press 'q' or ESC to quit
                    if key == ord("q") or key == 27:
                        break
                except Exception:
                    logging.info("Unable to show GUI window; continuing headless stream")
                    break

    finally:
        try:
            camera.release()
        except Exception:
            pass
        try:
            import cv2

            cv2.destroyAllWindows()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(run(headless=False))
