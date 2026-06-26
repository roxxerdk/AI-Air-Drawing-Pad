"""Simple drawing canvas using OpenCV for rendering.

Maintains an internal drawing layer and allows updating it based on
gestures/landmarks. The layer can be composited over camera frames for
display.
"""

from typing import Any, Optional, Tuple

from .finger_detector import FingerStates


class DrawingCanvas:
    def __init__(self, width: int = 1280, height: int = 720, color: Tuple[int, int, int] = (241, 102, 99)):
        self.width = width
        self.height = height
        self._color_presets = [
            (241, 102, 99),   # Indigo
            (212, 182, 6),    # Cyan
            (94, 197, 34),    # Green
            (68, 68, 239),    # Red
            (11, 158, 245),   # Orange
            (255, 255, 255)   # White
        ]
        self._color_idx = 0
        self.color = self._color_presets[self._color_idx]
        self.brush_size = 8
        self._gesture = None
        self._canvas = None
        self._prev_pt = None
        self._cv2 = None
        self._state_text = None
        self._prev_middle_state = False
        self._size_increment_time = 0.0

    def _ensure_cv2(self):
        if self._cv2 is None:
            try:
                import cv2

                self._cv2 = cv2
            except Exception as exc:  # pragma: no cover - environment dependent
                raise RuntimeError("OpenCV (cv2) is required for DrawingCanvas") from exc

    def _ensure_canvas(self):
        if self._canvas is None:
            import numpy as _np

            self._canvas = _np.zeros((self.height, self.width, 3), dtype=_np.uint8)

    def update(self, gesture: Optional[str], landmarks: Any = None, states: Optional[FingerStates] = None) -> None:
        """Update the internal canvas based on the gesture, landmarks, and finger states."""
        self._ensure_cv2()
        self._ensure_canvas()
        self._gesture = gesture

        # 1. Color cycle transition trigger (Middle finger open alone)
        if states:
            is_middle_open = states.middle and not states.thumb and not states.index and not states.ring and not states.pinky
            if is_middle_open and not self._prev_middle_state:
                self._color_idx = (self._color_idx + 1) % len(self._color_presets)
                self.color = self._color_presets[self._color_idx]
            self._prev_middle_state = is_middle_open

            # 2. Smooth brush scaling (All 5 fingers open)
            all_fingers_open = states.thumb and states.index and states.middle and states.ring and states.pinky
            if all_fingers_open:
                import time
                now = time.time()
                if now - self._size_increment_time > 0.2:
                    self.brush_size = 5 if self.brush_size >= 50 else self.brush_size + 3
                    self._size_increment_time = now

        # 3. Path drawing / erasing based on landmarks
        if gesture == "draw" and landmarks:
            idx = landmarks[8]
            x, y = int(idx[0]), int(idx[1])
            if self._prev_pt is not None:
                self._cv2.line(self._canvas, self._prev_pt, (x, y), self.color, self.brush_size)
            self._prev_pt = (x, y)
        elif gesture == "clear":
            self._canvas.fill(0)
            self._prev_pt = None
        else:
            self._prev_pt = None

        if states is not None:
            self._state_text = str(states)
        else:
            self._state_text = None

    def render_on(self, frame: Any, alpha: float = 0.7) -> Any:
        """Composite the drawing canvas on top of `frame` and return result."""
        if frame is None:
            return None

        self._ensure_cv2()
        self._ensure_canvas()

        # Resize canvas to frame if sizes differ
        h, w = frame.shape[:2]
        if (h, w) != (self.height, self.width):
            canvas = self._cv2.resize(self._canvas, (w, h))
        else:
            canvas = self._canvas

        try:
            blended = self._cv2.addWeighted(frame, 1.0, canvas, alpha, 0)
            if self._state_text:
                self._cv2.putText(blended, self._state_text, (10, 30), self._cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            if self._gesture:
                self._cv2.putText(
                    blended,
                    f"Gesture: {self._gesture.upper()}",
                    (10, 70),
                    self._cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 255),
                    2,
                )
            return blended
        except Exception:
            return frame
