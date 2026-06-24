from src.gesture_detector import GestureDetector


def make_landmarks_pair(a, b):
    # build a 21-point list with most points at (0,0) except thumb tip (4) and index tip (8)
    pts = [(0, 0)] * 21
    pts[4] = a
    pts[8] = b
    return pts


def test_pinch_detected_when_close():
    detector = GestureDetector(pinch_threshold=0.1)
    # frame size large so threshold in px is larger
    frame_size = (720, 1280)
    a = (100, 100)
    b = (105, 103)  # very close
    landmarks = make_landmarks_pair(a, b)
    assert detector.detect(landmarks, frame_size=frame_size) == "pinch"


def test_pinch_not_detected_when_far():
    detector = GestureDetector(pinch_threshold=0.01)
    frame_size = (720, 1280)
    a = (10, 10)
    b = (400, 300)  # far apart
    landmarks = make_landmarks_pair(a, b)
    assert detector.detect(landmarks, frame_size=frame_size) is None
