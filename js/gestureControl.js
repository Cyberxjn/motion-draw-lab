/**
 * gestureControl.js
 * ─────────────────────────────────────────────────────
 * Interprets MediaPipe hand landmarks as named gestures
 * and converts them into drawing commands.
 *
 * Gesture → Action mapping:
 *   ONE_FINGER   (index up, others down)  → Draw
 *   TWO_FINGERS  (index + middle up)      → Move / Scale
 *   OPEN_HAND    (all fingers up)         → Pause
 *   FIST         (all fingers down)       → Stop / Idle
 */

const GestureControl = (() => {
  /* ── Landmark indices (MediaPipe) ── */
  const TIP   = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
  const BASE  = { thumb: 2, index: 6, middle: 10, ring: 14, pinky: 18 };
  const WRIST = 0;

  /* ── State ── */
  let lastGesture   = 'NONE';
  let gestureFrames = 0;          // How many frames this gesture has been held
  const DEBOUNCE    = 3;          // Frames before gesture is "confirmed"

  // Two-finger pinch tracking for scale
  let lastPinchDist = null;

  /* ── Finger up/down detection ── */
  function isFingerUp(landmarks, finger) {
    if (finger === 'thumb') {
      // Thumb: compare x-axis (mirrored)
      return landmarks[TIP.thumb].x < landmarks[BASE.thumb].x;
    }
    return landmarks[TIP[finger]].y < landmarks[BASE[finger]].y;
  }

  /* ── Classify gesture from landmarks ── */
  function classify(landmarks) {
    const thumbUp  = isFingerUp(landmarks, 'thumb');
    const indexUp  = isFingerUp(landmarks, 'index');
    const middleUp = isFingerUp(landmarks, 'middle');
    const ringUp   = isFingerUp(landmarks, 'ring');
    const pinkyUp  = isFingerUp(landmarks, 'pinky');

    const upCount = [thumbUp, indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

    if (upCount >= 4)                              return 'OPEN_HAND';
    if (upCount === 0)                             return 'FIST';
    if (indexUp && middleUp && !ringUp && !pinkyUp) return 'TWO_FINGERS';
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return 'ONE_FINGER';
    if (thumbUp && indexUp && !middleUp)           return 'PINCH';

    return 'OTHER';
  }

  /* ── Get fingertip world position ── */
  function getIndexTip(landmarks, canvasW, canvasH) {
    const tip = landmarks[TIP.index];
    // MediaPipe returns normalized [0,1] — mirror X for natural drawing
    return {
      x: (1 - tip.x) * canvasW,
      y: tip.y * canvasH
    };
  }

  function getMiddleTip(landmarks, canvasW, canvasH) {
    const tip = landmarks[TIP.middle];
    return {
      x: (1 - tip.x) * canvasW,
      y: tip.y * canvasH
    };
  }

  /* ── Pinch distance (for scaling) ── */
  function getPinchDist(landmarks) {
    const t = landmarks[TIP.thumb];
    const i = landmarks[TIP.index];
    return Math.hypot(t.x - i.x, t.y - i.y);
  }

  /* ── Main process: called each frame with new landmarks ── */
  function process(landmarks, canvasW, canvasH) {
    if (!landmarks || landmarks.length < 21) {
      // No hand detected → stop drawing
      handleGesture('NONE', 0, 0, canvasW, canvasH, null);
      return { gesture: 'NONE', x: 0, y: 0 };
    }

    const raw = classify(landmarks);

    // Debounce: only act when gesture is stable for N frames
    if (raw === lastGesture) {
      gestureFrames++;
    } else {
      gestureFrames = 0;
      lastGesture = raw;
    }

    if (gestureFrames < DEBOUNCE && raw !== 'ONE_FINGER') {
      // For drawing keep responsive; for mode switches use debounce
      return { gesture: lastGesture, x: 0, y: 0 };
    }

    const { x, y } = getIndexTip(landmarks, canvasW, canvasH);
    handleGesture(raw, x, y, canvasW, canvasH, landmarks);

    return { gesture: raw, x, y };
  }

  /* ── Translate gesture into DrawingEngine commands ── */
  let prevGesture = 'NONE';

  function handleGesture(gesture, x, y, canvasW, canvasH, landmarks) {
    // ── ONE_FINGER → draw ──────────────────────────────
    if (gesture === 'ONE_FINGER') {
      if (prevGesture !== 'ONE_FINGER') {
        DrawingEngine.startDraw(x, y);
      } else {
        DrawingEngine.continueDraw(x, y);
      }
    }

    // ── Transition OUT of ONE_FINGER → commit shape ────
    if (prevGesture === 'ONE_FINGER' && gesture !== 'ONE_FINGER') {
      DrawingEngine.endDraw(x, y);
    }

    // ── TWO_FINGERS → move nearest object ──────────────
    if (gesture === 'TWO_FINGERS') {
      if (prevGesture !== 'TWO_FINGERS') {
        DrawingEngine.startMove(x, y);
        lastPinchDist = null;
      } else {
        DrawingEngine.moveObject(x, y);
      }
    }
    if (prevGesture === 'TWO_FINGERS' && gesture !== 'TWO_FINGERS') {
      DrawingEngine.endMove();
    }

    // ── PINCH → scale ──────────────────────────────────
    if (gesture === 'PINCH' && landmarks) {
      const dist = getPinchDist(landmarks);
      if (lastPinchDist !== null && lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        // Only scale if significant change (reduce jitter)
        if (Math.abs(factor - 1) > 0.005) {
          DrawingEngine.scaleObject(factor);
        }
      }
      lastPinchDist = dist;
    } else {
      lastPinchDist = null;
    }

    prevGesture = gesture;
  }

  /* ── Gesture display name ── */
  function getLabel(gesture) {
    const labels = {
      ONE_FINGER:  '☝️  Drawing',
      TWO_FINGERS: '✌️  Moving',
      PINCH:       '🤌  Scaling',
      OPEN_HAND:   '✋  Paused',
      FIST:        '✊  Idle',
      OTHER:       '🖐  Tracking',
      NONE:        '—  No Hand'
    };
    return labels[gesture] || gesture;
  }

  return { process, getLabel };
})();
