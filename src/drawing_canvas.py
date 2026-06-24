"""Simple drawing canvas using OpenCV for rendering.

Maintains an internal drawing layer and allows updating it based on
gestures/landmarks. The layer can be composited over camera frames for
display.
"""

from typing import Any, Optional, Tuple


class DrawingCanvas:
    def __init__(self, width: int = 1280, height: int = 720, color: Tuple[int, int, int] = (0, 255, 0)):
        self.width = width
        self.height = height
        self.color = color
        self._canvas = None
        self._prev_pt = None
        self._cv2 = None

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

    def update(self, gesture: Optional[str], landmarks: Any = None) -> None:
        """Update the internal canvas based on the gesture and landmarks.

        When a 'pinch' is active and landmarks are available we draw a
        line following the index fingertip (landmark 8).
        """
        self._ensure_cv2()
        self._ensure_canvas()

        if gesture == "pinch" and landmarks:
            idx = landmarks[8]
            x, y = int(idx[0]), int(idx[1])
            if self._prev_pt is not None:
                self._cv2.line(self._canvas, self._prev_pt, (x, y), self.color, 4)
            self._prev_pt = (x, y)
        else:
            # Release the pen when not pinching
            self._prev_pt = None

    def render_on(self, frame: Any, alpha: float = 0.7) -> Any:
        """Composite the drawing canvas on top of `frame` and return result."""
        self._ensure_cv2()
        self._ensure_canvas()

        if frame is None:
            return None

        # Resize canvas to frame if sizes differ
        h, w = frame.shape[:2]
        if (h, w) != (self.height, self.width):
            canvas = self._cv2.resize(self._canvas, (w, h))
        else:
            canvas = self._canvas

        try:
            blended = self._cv2.addWeighted(frame, 1.0, canvas, alpha, 0)
            return blended
        except Exception:
            return frame
