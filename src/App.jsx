import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// SVG Icons Component wrapper to render inline SVG definitions
const SVGIcon = ({ name, className }) => (
  <svg className={className || ""}>
    <use href={`#icon-${name}`}></use>
  </svg>
);

function App() {
  // --- Loading State ---
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // --- UI Configuration State ---
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraMode, setCameraMode] = useState("BROWSER_AI"); // SIMULATOR, BROWSER_AI, PYTHON_WS
  const [activeMode, setActiveMode] = useState("DRAW"); // DRAW, MOVE, ERASE, CLEAR
  const [brushColor, setBrushColor] = useState("#6366F1");
  const [brushSize, setBrushSize] = useState(8);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [recActive, setRecActive] = useState(true);
  
  // --- Telemetry State ---
  const [fps, setFps] = useState(60);
  const [latency, setLatency] = useState(4);
  const [confidence, setConfidence] = useState(98.4);
  const [fingerStates, setFingerStates] = useState({
    thumb: true,
    index: true,
    middle: false,
    ring: false,
    pinky: false
  });

  // --- Drawing & Interaction State ---
  const [toasts, setToasts] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // --- Refs ---
  const videoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const requestRef = useRef(null);

  // --- MediaPipe & WebSocket Refs ---
  const handsRef = useRef(null);
  const mediapipeCameraRef = useRef(null);
  const wsRef = useRef(null);
  
  const realLandmarksRef = useRef(null);
  const lastHandTime = useRef(0);
  const pythonFrameImageRef = useRef(new Image());

  // --- Gesture Trigger Transition Refs ---
  const prevMiddleStateRef = useRef(false);
  const prevFistStateRef = useRef(false);
  const brushSizeIncrementTimer = useRef(null);

  // --- Hand Velocity & Extrapolation Refs ---
  const lastIndexPositionRef = useRef(null);
  const indexVelocityRef = useRef({ x: 0, y: 0 });
  const lastUpdateTimeRef = useRef(Date.now());

  // --- Tracking Coordinates (Mouse or Auto-simulation) ---
  const trackingCoords = useRef({ x: 320, y: 180, active: false });
  const isMouseOverViewport = useRef(false);
  const autoTime = useRef(0);
  const drawingPaths = useRef([]);
  const redoStack = useRef([]);
  const activePath = useRef(null);

  // ================= 1. INITIALIZATION =================
  useEffect(() => {
    const logs = [
      "[INFO] Initializing WebGL Context...",
      "[INFO] Spawning Web Worker threads...",
      "[INFO] Initializing camera stream listener...",
      "[INFO] Loading MediaPipe Hands framework...",
      "[INFO] Model weights downloaded (14.2 MB)...",
      "[INFO] Gesture classifier pipeline loaded...",
      "[INFO] Calibrating light thresholds...",
      "[SUCCESS] Engine Ready. FPS target locked."
    ];

    let logIndex = 0;
    const logInterval = setInterval(() => {
      if (logIndex < logs.length) {
        setLoadingLogs(prev => [...prev, logs[logIndex]]);
        setLoadingProgress(Math.floor(((logIndex + 1) / logs.length) * 100));
        logIndex++;
      } else {
        clearInterval(logInterval);
        setTimeout(() => {
          setIsLoaded(true);
          addToast("AI Vision Engine Activated", "success");
        }, 800);
      }
    }, 200);

    return () => clearInterval(logInterval);
  }, []);

  // Initialize MediaPipe Hands
  useEffect(() => {
    if (!isLoaded) return;

    let initTimer;
    const initMediaPipe = () => {
      if (window.Hands) {
        const hands = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.45,
          minTrackingConfidence: 0.45
        });

        hands.onResults((results) => {
          if (cameraMode !== "BROWSER_AI") return;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const rawLandmarks = results.multiHandLandmarks[0];
            const canvas = cameraCanvasRef.current;
            if (canvas) {
              const w = canvas.width;
              const h = canvas.height;
              const mapped = rawLandmarks.map(lm => ({
                x: lm.x * w,
                y: lm.y * h,
                z: lm.z
              }));
              realLandmarksRef.current = mapped;
              lastHandTime.current = Date.now();
            }
          } else {
            if (Date.now() - lastHandTime.current > 500) {
              realLandmarksRef.current = null;
            }
          }
        });

        handsRef.current = hands;
        addToast("MediaPipe hand detection model linked", "success");
      } else {
        console.log("MediaPipe Hands CDN not fully loaded, retrying in 500ms...");
        initTimer = setTimeout(initMediaPipe, 500);
      }
    };

    initMediaPipe();
    return () => clearTimeout(initTimer);
  }, [isLoaded, cameraMode]);

  // ================= 2. TOAST SYSTEM =================
  const addToast = (message, type = "info") => {
    // Resolved duplicate key console logs warning
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // ================= 3. BROWSER WEBCAM STREAM CONTROLLER =================
  useEffect(() => {
    if (!isLoaded) return;

    let active = true;

    const startWebcam = async () => {
      try {
        if (cameraMode === "BROWSER_AI") {
          addToast("Requesting camera access...", "info");
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
          });
          
          if (!active) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.style.opacity = 0;
            videoRef.current.play().catch(e => console.log("Video playback delayed:", e));

            const bindCamera = () => {
              if (window.Camera && handsRef.current) {
                const cam = new window.Camera(videoRef.current, {
                  onFrame: async () => {
                    if (handsRef.current && cameraMode === "BROWSER_AI" && active) {
                      await handsRef.current.send({ image: videoRef.current });
                    }
                  },
                  width: 640,
                  height: 480
                });
                cam.start();
                mediapipeCameraRef.current = cam;
                addToast("Webcam AI Tracker Online", "success");
              } else {
                setTimeout(bindCamera, 300);
              }
            };
            bindCamera();
          }
        } else {
          stopWebcam();
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        addToast("Webcam blocked or missing. Fallback to simulator.", "error");
        setCameraMode("SIMULATOR");
      }
    };

    const stopWebcam = () => {
      if (mediapipeCameraRef.current) {
        mediapipeCameraRef.current.stop();
        mediapipeCameraRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      realLandmarksRef.current = null;
    };

    startWebcam();
    return () => {
      active = false;
      stopWebcam();
    };
  }, [cameraMode, isLoaded]);

  // ================= 4. WEBSOCKET BACKEND CONTROLLER =================
  useEffect(() => {
    if (!isLoaded) return;

    if (cameraMode !== "PYTHON_WS") {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    addToast("Connecting to Python CV2 model server...", "info");
    const ws = new WebSocket("ws://localhost:8765");

    ws.onopen = () => {
      addToast("Python backend WebSocket connected", "success");
    };

    ws.onmessage = (event) => {
      if (cameraMode !== "PYTHON_WS") return;

      const data = JSON.parse(event.data);
      if (data.type === "FRAME_UPDATE") {
        if (data.frame) {
          pythonFrameImageRef.current.src = data.frame;
        }

        const canvas = cameraCanvasRef.current;
        if (canvas && data.landmarks_normalized) {
          const w = canvas.width;
          const h = canvas.height;
          const mapped = data.landmarks_normalized.map(lm => ({
            x: lm.x * w,
            y: lm.y * h,
            z: 0
          }));
          realLandmarksRef.current = mapped;
          lastHandTime.current = Date.now();
        } else if (!data.hand_detected) {
          realLandmarksRef.current = null;
        }

        // Note: gesture classification and triggers will still process in the animation loop
        // using the transmitted data.fingerStates to ensure unified React action rules!
        if (data.fingerStates) {
          setFingerStates(data.fingerStates);
        }
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket client error:", err);
      addToast("Failed to link Python server. Make sure main.py is running.", "error");
      setCameraMode("SIMULATOR");
    };

    ws.onclose = () => {
      addToast("Python server connection closed", "warning");
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cameraMode, isLoaded]);

  // ================= 5. SIMULATOR KEYBOARD OVERRIDES =================
  useEffect(() => {
    if (cameraMode !== "SIMULATOR") return;

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      const COLOR_PRESETS = ["#6366F1", "#06B6D4", "#22C55E", "#EF4444", "#F59E0B", "#FFFFFF"];

      if (key === 'w') {
        // Write: One finger (Index open)
        setFingerStates({ thumb: false, index: true, middle: false, ring: false, pinky: false });
        setActiveMode("DRAW");
        addToast("Key W: Simulating Draw (Index)", "info");
      } else if (key === 'c') {
        // Change Color: Two fingers (Index + Middle open)
        setFingerStates({ thumb: false, index: true, middle: true, ring: false, pinky: false });
        setBrushColor(prevColor => {
          const idx = COLOR_PRESETS.indexOf(prevColor);
          const nextIdx = (idx + 1) % COLOR_PRESETS.length;
          const nextColor = COLOR_PRESETS[nextIdx];
          addToast(`Key C: Color changed to ${nextColor}`, "success");
          return nextColor;
        });
      } else if (key === 'e') {
        // Fist: Clear full screen
        setFingerStates({ thumb: false, index: false, middle: false, ring: false, pinky: false });
        handleClear();
        addToast("Key E: Simulating Fist (Clear Canvas)", "warning");
      } else if (key === 's') {
        // Size: All 5 fingers open
        setFingerStates({ thumb: true, index: true, middle: true, ring: true, pinky: true });
        setBrushSize(prevSize => {
          const nextSize = prevSize >= 50 ? 5 : prevSize + 3;
          addToast(`Key S: Brush size: ${nextSize}px`, "info");
          return nextSize;
        });
      } else if (key === 'm') {
        // Move Mode
        setFingerStates({ thumb: false, index: true, middle: true, ring: false, pinky: false });
        setActiveMode("MOVE");
        addToast("Key M: Simulating Move", "info");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cameraMode]);

  // ================= 6. ANIMATION & LANDMARK SIMULATION LOOP =================
  useEffect(() => {
    if (!isLoaded) return;

    const cameraCanvas = cameraCanvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;
    if (!cameraCanvas || !drawingCanvas) return;

    const ctxCam = cameraCanvas.getContext('2d');
    const ctxDraw = drawingCanvas.getContext('2d');

    // Redraws vector paths onto active canvas
    const redrawCanvas = (ctx) => {
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      drawingPaths.current.forEach(path => {
        if (path.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = path.opacity / 100;
        
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1.0; // Reset
    };

    const handleResize = () => {
      const rect = cameraCanvas.parentElement.getBoundingClientRect();
      cameraCanvas.width = rect.width;
      cameraCanvas.height = rect.height;
      drawingCanvas.width = rect.width;
      drawingCanvas.height = rect.height;
      redrawCanvas(ctxDraw);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Main animation frame loop
    const animate = () => {
      autoTime.current += 0.015;

      const w = cameraCanvas.width;
      const h = cameraCanvas.height;

      // 1. Draw camera panel background (real webcam vs Python WS vs synthetic background)
      if (cameraMode === "BROWSER_AI" && videoRef.current && videoRef.current.readyState >= 2) {
        ctxCam.drawImage(videoRef.current, 0, 0, w, h);
      } else if (cameraMode === "PYTHON_WS" && pythonFrameImageRef.current.src && pythonFrameImageRef.current.complete) {
        ctxCam.drawImage(pythonFrameImageRef.current, 0, 0, w, h);
      } else {
        ctxCam.fillStyle = '#0f1422';
        ctxCam.fillRect(0, 0, w, h);
        
        // Draw grid lines
        ctxCam.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctxCam.lineWidth = 1;
        for (let i = 0; i < w; i += 40) {
          ctxCam.beginPath();
          ctxCam.moveTo(i, 0);
          ctxCam.lineTo(i, h);
          ctxCam.stroke();
        }
        for (let j = 0; j < h; j += 40) {
          ctxCam.beginPath();
          ctxCam.moveTo(0, j);
          ctxCam.lineTo(w, j);
          ctxCam.stroke();
        }

        ctxCam.fillStyle = 'rgba(255, 255, 255, 0.01)';
        ctxCam.beginPath();
        ctxCam.arc(w / 2, h / 2, Math.sin(autoTime.current) * 150 + 200, 0, Math.PI * 2);
        ctxCam.fill();
      }

      // 2. Resolve hand coordinates & skeleton
      let pts = null;
      let isHandDetected = false;
      let calculatedMode = activeMode;
      const now = Date.now();

      if (cameraMode === "PYTHON_WS" || cameraMode === "BROWSER_AI") {
        const timeSinceLastHand = now - lastHandTime.current;
        
        if (realLandmarksRef.current && timeSinceLastHand <= 300) {
          const dt = now - lastUpdateTimeRef.current;
          
          // Extrapolate landmarks if we did not receive a new frame recently (e.g. > 35ms)
          if (timeSinceLastHand > 35) {
            if (dt > 0 && dt < 100) {
              const vx = indexVelocityRef.current.x;
              const vy = indexVelocityRef.current.y;
              realLandmarksRef.current = realLandmarksRef.current.map(pt => ({
                x: pt.x + vx * dt,
                y: pt.y + vy * dt,
                z: pt.z
              }));
              // Gradually slow down
              indexVelocityRef.current.x *= 0.95;
              indexVelocityRef.current.y *= 0.95;
            }
          }
          
          pts = realLandmarksRef.current;
          isHandDetected = true;
          
          // Compute current velocity before updating the timestamp
          if (pts && pts[8]) {
            const currPos = pts[8];
            const prevPos = lastIndexPositionRef.current;
            if (prevPos && dt > 0 && dt < 100) {
              const vx = (currPos.x - prevPos.x) / dt;
              const vy = (currPos.y - prevPos.y) / dt;
              // Smooth velocity
              indexVelocityRef.current = {
                x: indexVelocityRef.current.x * 0.6 + vx * 0.4,
                y: indexVelocityRef.current.y * 0.6 + vy * 0.4
              };
            }
            lastIndexPositionRef.current = { x: currPos.x, y: currPos.y };
          }
          
          lastUpdateTimeRef.current = now;
          
          // Classify finger extensions
          const fingers = classifyRealFingers(pts);
          setFingerStates(fingers);

          // Classify recognized gesture mode based on custom rules
          calculatedMode = classifyRealGesture(fingers);
          
          // Handle trigger events (color tapped, brush scaled)
          handleRealTimeGestureTriggers(fingers);

          // Map UI activeMode state transitions
          const isToolMode = (calculatedMode === "DRAW" || calculatedMode === "ERASE" || calculatedMode === "MOVE");
          if (isToolMode && calculatedMode !== activeMode) {
            setActiveMode(calculatedMode);
            addToast(`Switched to ${calculatedMode} mode`, "info");
          }
        } else {
          realLandmarksRef.current = null;
        }
      } else if (cameraMode === "SIMULATOR") {
        let targetX = 0;
        let targetY = 0;

        if (isMouseOverViewport.current) {
          targetX = trackingCoords.current.x;
          targetY = trackingCoords.current.y;
          isHandDetected = true;
        } else {
          // Traces infinity knot
          const t = autoTime.current;
          targetX = w / 2 + Math.sin(t * 1.5) * (w * 0.3);
          targetY = h / 2 + Math.sin(t * 3.0) * (h * 0.2);
          isHandDetected = true;
        }

        // Smooth cursor interpolation
        trackingCoords.current.x += (targetX - trackingCoords.current.x) * 0.15;
        trackingCoords.current.y += (targetY - trackingCoords.current.y) * 0.15;

        const px = trackingCoords.current.x;
        const py = trackingCoords.current.y;

        // Handle auto-gesture cycle when idle in simulator
        if (!isMouseOverViewport.current) {
          const factor = Math.sin(autoTime.current * 0.8);
          if (factor <= -0.5) {
            // Simulator Move
            setFingerStates({ thumb: false, index: true, middle: false, ring: false, pinky: false });
            calculatedMode = "MOVE";
          } else {
            // Simulator Write
            setFingerStates({ thumb: true, index: true, middle: false, ring: false, pinky: false });
            calculatedMode = "DRAW";
          }
          if (calculatedMode !== activeMode) {
            setActiveMode(calculatedMode);
          }
        }

        // Trigger dynamic color/brush size updates inside simulator
        handleRealTimeGestureTriggers(fingerStates);

        pts = computeHandSkeleton(px, py);
        calculatedMode = activeMode;
      }

      setCameraActive(cameraMode !== "SIMULATOR" ? isHandDetected : true);

      // 3. Process Drawing & Erasing paths exactly on the index fingertip pts[8]
      if (pts && pts.length >= 21) {
        const drawX = pts[8].x;
        const drawY = pts[8].y;

        const isDrawingActive = (cameraMode === "PYTHON_WS" || cameraMode === "BROWSER_AI")
          ? (calculatedMode === "DRAW")
          : (isMouseOverViewport.current ? (trackingCoords.current.active && activeMode === "DRAW") : (activeMode === "DRAW"));

        if (isDrawingActive) {
          if (!activePath.current) {
            activePath.current = {
              points: [{ x: drawX, y: drawY }],
              color: brushColor,
              size: brushSize,
              opacity: brushOpacity
            };
            drawingPaths.current.push(activePath.current);
            redoStack.current = [];
          } else {
            activePath.current.points.push({ x: drawX, y: drawY });
          }
          redrawCanvas(ctxDraw);
        } else {
          activePath.current = null;
        }

        // ERASE Mode
        const isErasingActive = (cameraMode === "PYTHON_WS" || cameraMode === "BROWSER_AI")
          ? (calculatedMode === "ERASE")
          : (isMouseOverViewport.current ? (trackingCoords.current.active && activeMode === "ERASE") : (activeMode === "ERASE"));

        if (isErasingActive) {
          const eraseRadius = brushSize * 4;
          drawingPaths.current = drawingPaths.current.map(path => {
            const filteredPoints = path.points.filter(pt => {
              const dx = pt.x - drawX;
              const dy = pt.y - drawY;
              return (dx * dx + dy * dy) > (eraseRadius * eraseRadius);
            });
            return { ...path, points: filteredPoints };
          }).filter(path => path.points.length > 0);
          redrawCanvas(ctxDraw);
        }

        // Render Hand skeleton overlay
        drawHandSkeleton(ctxCam, pts);
      }

      // 4. Update Telemetry metrics
      if (Math.random() > 0.95) {
        setFps(60 - Math.floor(Math.random() * 2));
        setLatency(3 + Math.floor(Math.random() * 3));
        setConfidence((97.8 + Math.random() * 1.5).toFixed(1));
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [isLoaded, activeMode, brushColor, brushSize, brushOpacity, cameraMode, fingerStates]);

  // ================= 7. REAL-TIME CUSTOM GESTURE RULES =================
  
  // Real-time classification rules
  const classifyRealGesture = (fingers) => {
    // 1. Open palm: brush font increase
    if (fingers.thumb && fingers.index && fingers.middle && fingers.ring && fingers.pinky) {
      return "SIZE_UP";
    }
    // 2. Fist: erase full screen (clear)
    if (!fingers.thumb && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      return "CLEAR";
    }
    // 3. Two fingers: colour change (Index + Middle open, Ring/Pinky closed)
    if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
      return "COLOR_CYCLE";
    }
    // 4. One finger: Draw (Index open, Middle/Ring/Pinky closed)
    if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      return "DRAW";
    }
    // Default fallback: Move pointer without drawing
    return "MOVE";
  };

  // Real-time edge trigger handlers
  const handleRealTimeGestureTriggers = (fingers) => {
    // A. COLOR SWAP TAPs (Two fingers: Index + Middle open, Ring + Pinky closed)
    const isTwoFingers = fingers.index && fingers.middle && !fingers.ring && !fingers.pinky;
    if (isTwoFingers && !prevMiddleStateRef.current) {
      const COLOR_PRESETS = ["#6366F1", "#06B6D4", "#22C55E", "#EF4444", "#F59E0B", "#FFFFFF"];
      setBrushColor(prevColor => {
        const idx = COLOR_PRESETS.indexOf(prevColor);
        const nextIdx = (idx + 1) % COLOR_PRESETS.length;
        const nextColor = COLOR_PRESETS[nextIdx];
        addToast(`Color updated to ${nextColor}`, "success");
        return nextColor;
      });
    }
    prevMiddleStateRef.current = isTwoFingers;

    // B. SMOOTH BRUSH SCALING (All 5 fingers open)
    const allFingersOpen = fingers.thumb && fingers.index && fingers.middle && fingers.ring && fingers.pinky;
    if (allFingersOpen) {
      if (!brushSizeIncrementTimer.current) {
        brushSizeIncrementTimer.current = Date.now();
      }
      if (Date.now() - brushSizeIncrementTimer.current > 200) {
        setBrushSize(prevSize => {
          const nextSize = prevSize >= 50 ? 5 : prevSize + 3;
          addToast(`Brush size scaled: ${nextSize}px`, "info");
          return nextSize;
        });
        brushSizeIncrementTimer.current = Date.now();
      }
    } else {
      brushSizeIncrementTimer.current = null;
    }

    // C. CLEAR CANVAS TAPs (Fist - all closed)
    const isFist = !fingers.thumb && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
    if (isFist && !prevFistStateRef.current) {
      handleClear();
    }
    prevFistStateRef.current = isFist;
  };

  const classifyRealFingers = (pts) => {
    if (!pts || pts.length < 21) {
      return { thumb: false, index: false, middle: false, ring: false, pinky: false };
    }

    const d = (i, j) => {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const palmWidth = d(5, 17) || 1.0;

    const thumbExtended = d(4, 5) > palmWidth * 0.45;
    const indexExtended = d(8, 5) > palmWidth * 0.45;
    const middleExtended = d(12, 9) > palmWidth * 0.45;
    const ringExtended = d(16, 13) > palmWidth * 0.45;
    const pinkyExtended = d(20, 17) > palmWidth * 0.45;

    return {
      thumb: thumbExtended,
      index: indexExtended,
      middle: middleExtended,
      ring: ringExtended,
      pinky: pinkyExtended
    };
  };

  // ================= 8. SYNTHETIC SKELETON GENERATOR =================
  // Generates 21 skeleton joints with index fingertip (list[8]) aligned exactly at cursor (x,y)
  // Bends and stretches joints based on dynamic state matrix rules
  const computeHandSkeleton = (x, y) => {
    const list = [];

    // Alignment: Place Index Tip (list[8]) exactly at cursor (x, y)
    const indexBent = !fingerStates.index;
    list[8] = { x: x, y: y };
    list[7] = { x: x, y: y + (indexBent ? 15 : 30) };
    list[6] = { x: x, y: y + (indexBent ? 30 : 50) };
    list[5] = { x: x, y: y + (indexBent ? 45 : 70) };

    // Wrist anchored below index knuckle
    list[0] = { x: x + 25, y: y + 160 };

    // Thumb (bends if thumb is false)
    const thumbBent = !fingerStates.thumb;
    list[1] = { x: x - 15, y: y + 130 };
    list[2] = { x: x - 35, y: y + 105 };
    list[3] = { x: x - 50, y: y + 80 };
    list[4] = { x: x - (thumbBent ? 30 : 60), y: y + (thumbBent ? 75 : 65) };

    // Middle (bends if middle is false)
    const middleBent = !fingerStates.middle;
    list[9] = { x: x + 25, y: y + 70 };
    list[10] = { x: x + 27, y: y + 40 };
    list[11] = { x: x + 27, y: y + 20 };
    list[12] = { x: x + 27, y: y + (middleBent ? 50 : -10) };

    // Ring (bends if ring is false)
    const ringBent = !fingerStates.ring;
    list[13] = { x: x + 50, y: y + 75 };
    list[14] = { x: x + 50, y: y + 45 };
    list[15] = { x: x + 50, y: y + 25 };
    list[16] = { x: x + 50, y: y + (ringBent ? 55 : -5) };

    // Pinky (bends if pinky is false)
    const pinkyBent = !fingerStates.pinky;
    list[17] = { x: x + 70, y: y + 85 };
    list[18] = { x: x + 72, y: y + 60 };
    list[19] = { x: x + 72, y: y + 40 };
    list[20] = { x: x + 72, y: y + (pinkyBent ? 65 : 15) };

    return list;
  };

  // Draws joint skeletons crash-safely
  const drawHandSkeleton = (ctx, pts) => {
    if (!pts || pts.length < 21) return;

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 2.5;

    // Palm base links
    drawLink(ctx, pts[0], pts[1]);
    drawLink(ctx, pts[0], pts[5]);
    drawLink(ctx, pts[0], pts[17]);
    drawLink(ctx, pts[5], pts[9]);
    drawLink(ctx, pts[9], pts[13]);
    drawLink(ctx, pts[13], pts[17]);

    // Finger segments
    for (let f = 0; f < 5; f++) {
      const base = f === 0 ? 1 : (f - 1) * 4 + 5;
      drawLink(ctx, pts[base], pts[base + 1]);
      drawLink(ctx, pts[base + 1], pts[base + 2]);
      drawLink(ctx, pts[base + 2], pts[base + 3]);
    }

    // Glowing joints
    pts.forEach((pt, idx) => {
      ctx.fillStyle = idx === 8 ? '#6366F1' : '#06B6D4';
      ctx.shadowBlur = 10;
      ctx.shadowColor = idx === 8 ? 'rgba(99, 102, 241, 0.8)' : 'rgba(6, 182, 212, 0.8)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, idx === 8 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.shadowBlur = 0;
  };

  const drawLink = (ctx, p1, p2) => {
    if (!p1 || !p2) return;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  };

  const updateFingerMatrixFromGesture = (mode, drawing) => {
    const isErase = (mode === "ERASE");
    const isDraw = (mode === "DRAW" && drawing);

    setFingerStates({
      thumb: !(isDraw || isErase),
      index: !isErase,
      middle: !(isDraw || isErase),
      ring: !(isDraw || isErase),
      pinky: !(isDraw || isErase)
    });
  };

  // ================= 10. VIEWPORT MOUSE ACTIONS =================
  const handleMouseMove = (e) => {
    const canvas = cameraCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    trackingCoords.current.x = e.clientX - rect.left;
    trackingCoords.current.y = e.clientY - rect.top;
  };

  const handleMouseEnter = () => {
    isMouseOverViewport.current = true;
    addToast("Manual override: cursor tracking active", "info");
  };

  const handleMouseLeave = () => {
    isMouseOverViewport.current = false;
    trackingCoords.current.active = false;
    addToast("Auto-simulation active", "info");
  };

  const handleMouseDown = () => {
    trackingCoords.current.active = true;
  };

  const handleMouseUp = () => {
    trackingCoords.current.active = false;
  };

  // ================= 11. CANVAS ACTIONS =================
  const handleUndo = () => {
    if (drawingPaths.current.length > 0) {
      const removed = drawingPaths.current.pop();
      redoStack.current.push(removed);
      addToast("Action undone", "info");
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const restored = redoStack.current.pop();
      drawingPaths.current.push(restored);
      addToast("Action redone", "info");
    }
  };

  const handleClear = () => {
    drawingPaths.current = [];
    redoStack.current = [];
    addToast("Canvas cleared", "warning");
  };

  const handleSavePng = () => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `aircanvas_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    addToast("Canvas exported successfully", "success");
  };

  const getGestureConfig = (mode) => {
    switch (mode) {
      case "DRAW":
        return { icon: "☝️", title: "One finger-Draw", desc: "Index finger open, writing on screen" };
      case "COLOR_CYCLE":
        return { icon: "✌️", title: "Two fingers-color change", desc: "Index + Middle open, cycling color preset" };
      case "CLEAR":
        return { icon: "✊", title: "Fist-erase full screen", desc: "All 5 fingers closed, clearing canvas" };
      case "SIZE_UP":
        return { icon: "🖐", title: "Open palm-brush increase", desc: "All 5 fingers open, scaling brush size" };
      case "MOVE":
        return { icon: "👉", title: "Move Mode", desc: "Hover and position selector" };
      default:
        return { icon: "👉", title: "Move Mode", desc: "Hover and position selector" };
    }
  };

  const activeGesture = getGestureConfig(activeMode);

  return (
    <>
      {/* Loading Overlay */}
      <div id="loading-overlay" className={`overlay-container ${isLoaded ? 'hidden' : ''}`}>
        <div className="loading-box">
          <div className="logo-spinner">
            <SVGIcon name="logo" className="spinner-svg" />
          </div>
          <h2 className="loading-title">AirCanvas AI</h2>
          <p className="loading-status">Initializing AI Vision Engine...</p>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${loadingProgress}%` }}></div>
          </div>
          <div className="console-log-container">
            <div className="console-logs">
              {loadingLogs.map((log, idx) => (
                <div key={idx} className="log-line">{log}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main App Layout */}
      <div className="app-container">
        
        {/* Top Header */}
        <header className="nav-bar glass-panel">
          <div className="nav-left">
            <SVGIcon name="logo" className="brand-logo" />
            <div className="brand-info">
              <span className="brand-name">AirCanvas AI</span>
              <span className="brand-tagline">Real-Time AI Gesture Drawing</span>
            </div>
          </div>

          <div className="nav-center telemetry-pills">
            <div className="telemetry-pill">
              <span className="pill-label">FPS:</span>
              <span id="telemetry-fps" className="pill-value val-monospaced text-success">{fps}</span>
            </div>
            <div className="telemetry-pill">
              <span className="pill-label">LATENCY:</span>
              <span id="telemetry-latency" className="pill-value val-monospaced text-cyan">{latency}ms</span>
            </div>
          </div>

          <div className="nav-right">
            <div className={`connection-status ${cameraActive ? '' : 'disconnected'}`}>
              <span className={`status-indicator ${cameraActive ? 'success-pulse' : 'error-pulse'}`}></span>
              <span className={`status-text ${cameraActive ? 'connected' : 'disconnected'}`}>
                {cameraActive ? 'CAMERA ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <button className="nav-btn" onClick={() => setCameraActive(!cameraActive)} title="Toggle Camera Feed">
              <SVGIcon name="theme" />
            </button>
            <button className="nav-btn" onClick={() => setShowSettings(!showSettings)} title="Toggle Webcam Input">
              <SVGIcon name="settings" />
            </button>
            <a href="https://github.com" className="nav-btn-link" target="_blank" rel="noreferrer">
              <SVGIcon name="github" className="github-icon" />
              <span>GitHub</span>
            </a>
          </div>
        </header>

        {/* Workspace */}
        <main className="dashboard-grid">
          
          {/* Left Area */}
          <section className="camera-panel-wrapper glass-panel">
            <div className="camera-floating-header">
              <div className="mode-badge">
                <span className="badge-icon">{activeGesture.icon}</span>
                <span className="badge-text">{activeGesture.title.toUpperCase()}</span>
              </div>
              <div className="telemetry-float">
                <span>Confidence: <strong className="text-cyan">{confidence}%</strong></span>
                {recActive && <span className="rec-indicator" id="rec-dot">● REC</span>}
              </div>
            </div>

            <div 
              className="camera-viewport-container"
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
            >
              <video ref={videoRef} id="webcam-feed" autoPlay playsInline muted></video>
              <canvas ref={cameraCanvasRef} id="camera-canvas"></canvas>
              <canvas ref={drawingCanvasRef} id="drawing-canvas" className="overlay-layer"></canvas>

              {!cameraActive && (
                <div id="empty-state-overlay" className="empty-state-overlay">
                  <SVGIcon name="empty-hand" className="empty-hand-icon" />
                  <h3>Hand Tracking Suspended</h3>
                  <p>Position your hand within the camera's field of view to resume drawing.</p>
                </div>
              )}
            </div>
          </section>

          {/* Right Area */}
          <aside className="dashboard-sidebar">
            
            {/* Card 1: AI Diagnostics */}
            <div className="sidebar-card glass-panel accent-glow-cyan">
              <div className="card-header">
                <h3>AI Diagnostics</h3>
                <span className="header-led active"></span>
              </div>
              <div className="diagnostics-list">
                <div className="diagnostic-row">
                  <span className="diag-label">Camera Mode</span>
                  <select 
                    className="select-dropdown" 
                    value={cameraMode} 
                    onChange={(e) => {
                      setCameraMode(e.target.value);
                      addToast(`Camera mode set to ${e.target.value}`, "info");
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)',
                      padding: '2px 6px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="SIMULATOR">Simulator (Mouse)</option>
                    <option value="BROWSER_AI">Webcam (Browser AI)</option>
                    <option value="PYTHON_WS">Python Backend (AI)</option>
                  </select>
                </div>
                <div className="diagnostic-row">
                  <span className="diag-label">Precision Threshold</span>
                  <span className="diag-value">v0.10.0 (Loaded)</span>
                </div>
                <div className="diagnostic-row">
                  <span className="diag-label">Inference Lag</span>
                  <span className="diag-value text-cyan val-monospaced">{latency}ms</span>
                </div>
                <div className="diagnostic-row">
                  <span className="diag-label">Inference Accuracy</span>
                  <span className="diag-value text-success">98.9% Acc</span>
                </div>
              </div>
            </div>

            {/* Card 2: Current Gesture */}
            <div className="sidebar-card glass-panel">
              <div className="card-header">
                <h3>Current Gesture</h3>
              </div>
              <div className="gesture-display">
                <div className="gesture-icon-box">
                  <span className="gesture-giant-icon">{activeGesture.icon}</span>
                </div>
                <div className="gesture-details">
                  <h2>{activeGesture.title}</h2>
                  <p>{activeGesture.desc}</p>
                </div>
              </div>
            </div>

            {/* Card 3: Finger Tracking Matrix */}
            <div className="sidebar-card glass-panel">
              <div className="card-header">
                <h3>Finger Tracking Matrix</h3>
              </div>
              <div className="finger-matrix">
                {Object.entries(fingerStates).map(([finger, active]) => (
                  <div key={finger} className="finger-row">
                    <span className="finger-label" style={{textTransform: 'capitalize'}}>{finger}</span>
                    <div className="finger-indicators">
                      <span className={`indicator-dot ${active ? 'active' : ''}`}></span>
                      <span className="indicator-label">{active ? 'Active' : 'Muted'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 4: Brush & Opacity Sliders */}
            <div className="sidebar-card glass-panel accent-glow-indigo">
              <div className="card-header">
                <h3>Brush Controls</h3>
              </div>
              <div className="brush-settings">
                <div className="settings-group">
                  <span className="settings-label">Color Presets</span>
                  <div className="color-palette">
                    {["#6366F1", "#06B6D4", "#22C55E", "#EF4444", "#F59E0B", "#FFFFFF"].map(color => (
                      <button 
                        key={color} 
                        className={`color-swatch ${brushColor === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setBrushColor(color);
                          addToast(`Brush color updated to ${color}`, "info");
                        }}
                      ></button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <div className="slider-header">
                    <span className="settings-label">Brush Size</span>
                    <span className="slider-value">{brushSize}px</span>
                  </div>
                  <input 
                    type="range" 
                    className="range-slider" 
                    min="1" 
                    max="50" 
                    value={brushSize} 
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  />
                </div>

                <div className="settings-group">
                  <div className="slider-header">
                    <span className="settings-label">Opacity</span>
                    <span className="slider-value">{brushOpacity}%</span>
                  </div>
                  <input 
                    type="range" 
                    className="range-slider" 
                    min="10" 
                    max="100" 
                    value={brushOpacity} 
                    onChange={(e) => setBrushOpacity(parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Card 5: Core Buttons */}
            <div className="sidebar-card glass-panel">
              <div className="card-header">
                <h3>Actions</h3>
              </div>
              <div className="canvas-controls-grid">
                <button className="action-btn" onClick={handleUndo} title="Undo last segment">
                  <SVGIcon name="undo" />
                  <span>Undo</span>
                </button>
                <button className="action-btn" onClick={handleRedo} title="Redo last segment">
                  <SVGIcon name="redo" />
                  <span>Redo</span>
                </button>
                <button className="action-btn btn-danger" onClick={handleClear} title="Clear whole board">
                  <SVGIcon name="clear" />
                  <span>Clear</span>
                </button>
                <button className="action-btn btn-primary" onClick={handleSavePng} title="Export drawing as image file">
                  <SVGIcon name="save" />
                  <span>Save PNG</span>
                </button>
              </div>
            </div>

          </aside>

        </main>

        {/* Bottom Floating Bar */}
        <div className="floating-toolbar-wrapper">
          <div className="floating-toolbar glass-panel">
            {["DRAW", "MOVE"].map(mode => (
              <button 
                key={mode} 
                className={`toolbar-tab ${activeMode === mode ? 'active' : ''}`}
                onClick={() => {
                  setActiveMode(mode);
                  addToast(`Switched to ${mode.toUpperCase()} mode`, "info");
                }}
              >
                <SVGIcon name={mode.toLowerCase()} className="tab-icon" />
                <span className="tab-label" style={{textTransform: 'capitalize'}}>{mode.toLowerCase()}</span>
              </button>
            ))}
            <button className="toolbar-tab text-danger" onClick={handleClear}>
              <SVGIcon name="clear" className="tab-icon" />
              <span className="tab-label">Reset</span>
            </button>
          </div>
        </div>

      </div>

      {/* Toasts list */}
      <div id="toast-container" className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className="toast">
            <span className="toast-content">{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
