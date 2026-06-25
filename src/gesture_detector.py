"""Simple gesture detector (pinch detection).

Detects a basic 'pinch' gesture by measuring the distance between the
thumb tip (landmark 4) and the index finger tip (landmark 8). The
detection threshold scales with the frame diagonal when `frame_size`
is provided.
"""

from typing import Any, Optional, Sequence, Tuple
import math


class GestureDetector:
    def __init__(self, pinch_threshold: float = 0.05):
        """pinch_threshold is fraction of image diagonal used as threshold."""
        self.pinch_threshold = pinch_threshold

    def _dist(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    def detect(self, landmarks: Optional[Sequence[Tuple[int, int]]], frame_size: Optional[Tuple[int, int]] = None) -> Optional[str]:
        """Return 'pinch' if detected else None.

        landmarks: sequence of (x,y) for 21 MediaPipe hand landmarks.
        frame_size: (height, width) used to scale the threshold.
        """
        if not landmarks:
            return None
        try:
            thumb_tip = landmarks[4]
            index_tip = landmarks[8]
        except Exception:
            return None

        dist = self._dist(thumb_tip, index_tip)
        if frame_size is not None:
            h, w = frame_size
            diag = math.hypot(w, h)
            thresh_px = self.pinch_threshold * diag
        else:
            thresh_px = 40.0

        if dist <= thresh_px:
            return "pinch"
        return None
