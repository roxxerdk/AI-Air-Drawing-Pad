"""Camera abstraction with lazy OpenCV import.

This class lazily imports `cv2` so the rest of the package can be
imported and unit-tested without OpenCV being present. When `start`
is called it will attempt to open the requested capture device.
"""

from typing import Tuple, Any, Optional


class Camera:
    def __init__(self, src: int = 0):
        self.src = src
        self._cap = None
        self._cv2 = None

    def _ensure_cv2(self):
        if self._cv2 is None:
            try:
                import cv2

                self._cv2 = cv2
            except Exception as exc:  # pragma: no cover - environment dependent
                raise RuntimeError("OpenCV (cv2) is required for Camera") from exc

    def start(self) -> None:
        """Open the camera device.

        Raises RuntimeError if OpenCV is not installed or the device cannot
        be opened.
        """
        self._ensure_cv2()
        self._cap = self._cv2.VideoCapture(self.src)
        if not self._cap.isOpened():
            raise RuntimeError(f"Unable to open camera src={self.src}")

    def read(self) -> Tuple[bool, Optional[Any]]:
        """Return (ok, frame).

        Frame is a BGR numpy array when available.
        """
        if self._cap is None:
            return False, None
        ok, frame = self._cap.read()
        return ok, frame

    def release(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            finally:
                self._cap = None
