"""Gesture detector based on finger states."""

from typing import Optional

from .finger_detector import FingerStates


class GestureDetector:
    def detect(self, states: Optional[FingerStates]) -> Optional[str]:
        if states is None:
            return None

        # 1. Open palm: brush font increase
        if states.thumb and states.index and states.middle and states.ring and states.pinky:
            return "size_up"

        # 2. Fist: erase full screen (clear)
        if not states.thumb and not states.index and not states.middle and not states.ring and not states.pinky:
            return "clear"

        # 3. Two fingers: colour change (Index + Middle open, Ring/Pinky closed)
        if states.index and states.middle and not states.ring and not states.pinky:
            return "color_cycle"

        # 4. One finger: Draw (Index open, Middle/Ring/Pinky closed)
        if states.index and not states.middle and not states.ring and not states.pinky:
            return "draw"

        # Default fallback: Move pointer
        return "move"
