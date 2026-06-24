"""Application orchestration for AI Air Drawing Pad.

This module wires the camera -> tracker -> gesture detector -> canvas
pipeline and runs a simple OpenCV display loop. Components are kept
lightweight and raise informative errors if required optional
dependencies are missing.
"""

import logging
from typing import Optional

from .camera import Camera
from .hand_tracker import HandTracker
from .gesture_detector import GestureDetector
from .drawing_canvas import DrawingCanvas


def run(headless: bool = True) -> int:
    logging.info("App.run(headless=%s)", headless)

    camera = Camera()
    tracker = HandTracker()
    detector = GestureDetector()
    canvas = DrawingCanvas()

    if headless:
        logging.info("Headless mode: not starting camera loop")
        return 0

    try:
        camera.start()
    except Exception as exc:
        logging.error("Camera failed to start: %s", exc)
        return 2

    # Main loop
    try:
        while True:
            ok, frame = camera.read()
            if not ok or frame is None:
                logging.warning("Empty frame received, stopping")
                break

            landmarks = None
            try:
                landmarks = tracker.process(frame)
            except Exception:
                # If tracker fails, continue showing camera frames
                landmarks = None

            gesture = detector.detect(landmarks, frame_size=frame.shape[:2])
            canvas.update(gesture, landmarks)

            try:
                out = canvas.render_on(frame)
            except Exception:
                out = frame

            # Show the composed frame
            try:
                import cv2

                cv2.imshow("AI Air Drawing Pad", out)
                key = cv2.waitKey(1) & 0xFF
                # Press 'q' or ESC to quit
                if key == ord("q") or key == 27:
                    break
            except Exception:
                # If OpenCV windowing isn't available, exit loop
                logging.info("Unable to show GUI window; exiting loop")
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
