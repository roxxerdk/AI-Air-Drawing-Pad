from src.finger_detector import FingerDetector, FingerStates
from src.gesture_detector import GestureDetector


def make_landmarks(thumb_up=True, index_up=True, middle_up=False, ring_up=False, pinky_up=False):
    pts = [(200, 400)] * 21 # wrist
    pts[1] = (170, 390)
    pts[2] = (140, 380)
    pts[3] = (120, 360)
    pts[4] = (100, 340) if thumb_up else (140, 360)
    
    pts[5] = (160, 320)
    pts[6] = (160, 280)
    pts[7] = (160, 260)
    pts[8] = (160, 240) if index_up else (160, 330)
    
    pts[9] = (200, 320)
    pts[10] = (200, 280)
    pts[11] = (200, 255)
    pts[12] = (200, 230) if middle_up else (200, 330)
    
    pts[13] = (240, 320)
    pts[14] = (240, 280)
    pts[15] = (240, 260)
    pts[16] = (240, 230) if ring_up else (240, 330)
    
    pts[17] = (280, 330)
    pts[18] = (280, 300)
    pts[19] = (280, 280)
    pts[20] = (280, 250) if pinky_up else (280, 340)
    return pts


def test_gesture_detect_draw_for_index_up():
    landmarks = make_landmarks(thumb_up=True, index_up=True, middle_up=False, ring_up=False, pinky_up=False)
    states = FingerDetector().detect(landmarks)
    gesture = GestureDetector().detect(states)
    assert gesture == "draw"


def test_gesture_detect_color_cycle_for_index_middle_up():
    landmarks = make_landmarks(thumb_up=False, index_up=True, middle_up=True, ring_up=False, pinky_up=False)
    states = FingerDetector().detect(landmarks)
    gesture = GestureDetector().detect(states)
    assert gesture == "color_cycle"


def test_gesture_detect_size_up_for_open_palm():
    landmarks = make_landmarks(thumb_up=True, index_up=True, middle_up=True, ring_up=True, pinky_up=True)
    states = FingerDetector().detect(landmarks)
    gesture = GestureDetector().detect(states)
    assert gesture == "size_up"


def test_gesture_detect_clear_for_fist():
    landmarks = make_landmarks(thumb_up=False, index_up=False, middle_up=False, ring_up=False, pinky_up=False)
    states = FingerDetector().detect(landmarks)
    gesture = GestureDetector().detect(states)
    assert gesture == "clear"


def test_gesture_detect_move_fallback():
    landmarks = make_landmarks(thumb_up=False, index_up=True, middle_up=False, ring_up=True, pinky_up=False)
    states = FingerDetector().detect(landmarks)
    gesture = GestureDetector().detect(states)
    assert gesture == "move"
