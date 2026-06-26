"""Detect which fingers are raised from MediaPipe hand landmarks."""

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple


@dataclass(frozen=True)
class FingerStates:
    thumb: bool = False
    index: bool = False
    middle: bool = False
    ring: bool = False
    pinky: bool = False

    def as_dict(self):
        return {
            "thumb": self.thumb,
            "index": self.index,
            "middle": self.middle,
            "ring": self.ring,
            "pinky": self.pinky,
        }

    def __str__(self) -> str:
        states = [
            f"Thumb : {'UP' if self.thumb else 'DOWN'}",
            f"Index : {'UP' if self.index else 'DOWN'}",
            f"Middle : {'UP' if self.middle else 'DOWN'}",
            f"Ring : {'UP' if self.ring else 'DOWN'}",
            f"Pinky : {'UP' if self.pinky else 'DOWN'}",
        ]
        return " ".join(states)
class FingerDetector:
    def detect(self, landmarks: Optional[Sequence[Tuple[int, int]]]) -> Optional[FingerStates]:
        if not landmarks or len(landmarks) < 21:
            return None

        import math
        def d(i, j):
            p1 = landmarks[i]
            p2 = landmarks[j]
            return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

        palm_width = d(5, 17)
        if palm_width == 0:
            palm_width = 1.0

        thumb_up = d(4, 5) > palm_width * 0.45
        index_up = d(8, 5) > palm_width * 0.45
        middle_up = d(12, 9) > palm_width * 0.45
        ring_up = d(16, 13) > palm_width * 0.45
        pinky_up = d(20, 17) > palm_width * 0.45

        return FingerStates(
            thumb=thumb_up,
            index=index_up,
            middle=middle_up,
            ring=ring_up,
            pinky=pinky_up,
        )
