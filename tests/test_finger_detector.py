from src.finger_detector import FingerDetector, FingerStates


def make_realistic_landmarks(thumb_up=True, index_up=True, middle_up=True, ring_up=True, pinky_up=True):
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


def test_finger_states_for_open_palm():
    detector = FingerDetector()
    landmarks = make_realistic_landmarks(thumb_up=True, index_up=True, middle_up=True, ring_up=True, pinky_up=True)
    states = detector.detect(landmarks)
    assert states == FingerStates(thumb=True, index=True, middle=True, ring=True, pinky=True)


def test_finger_states_for_index_up():
    detector = FingerDetector()
    landmarks = make_realistic_landmarks(thumb_up=True, index_up=True, middle_up=False, ring_up=False, pinky_up=False)
    states = detector.detect(landmarks)
    assert states == FingerStates(thumb=True, index=True, middle=False, ring=False, pinky=False)
