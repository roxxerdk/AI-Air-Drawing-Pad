"""Hand tracking wrapper using MediaPipe (lazy import).

Provides a small wrapper that converts MediaPipe results into a simple
list of (x, y) pixel coordinates for the first detected hand.
If MediaPipe is not available the wrapper raises on use.
"""

from typing import Any, Optional, List, Tuple


class HandTracker:
    def __init__(self, max_num_hands: int = 1):
        self._mp_hands = None
        self._hands = None
        self._max_num_hands = max_num_hands

    def _ensure_mediapipe(self):
        if self._mp_hands is None:
            try:
                import mediapipe as mp

                self._mp_hands = mp.solutions.hands
                self._hands = self._mp_hands.Hands(static_image_mode=False, max_num_hands=self._max_num_hands)
            except Exception as exc:  # pragma: no cover - environment dependent
                raise RuntimeError("mediapipe is required for HandTracker") from exc

    def process(self, frame: Any) -> Optional[List[Tuple[int, int]]]:
        """Process a BGR frame and return list of (x,y) pixel coords for landmarks.

        Returns None when no hand is detected.
        """
        if frame is None:
            return None
        self._ensure_mediapipe()

        # MediaPipe expects RGB
        import cv2

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self._hands.process(rgb)
        if not results.multi_hand_landmarks:
            return None

        hand_landmarks = results.multi_hand_landmarks[0]
        h, w = frame.shape[:2]
        pts = []
        for lm in hand_landmarks.landmark:
            x_px = int(lm.x * w)
            y_px = int(lm.y * h)
            pts.append((x_px, y_px))
        return pts
