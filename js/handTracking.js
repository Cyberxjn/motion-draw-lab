/**
 * handTracking.js
 * ─────────────────────────────────────────────────────
 * Sets up MediaPipe Hands, connects it to the webcam,
 * and drives the GestureControl → DrawingEngine pipeline
 * every frame via requestAnimationFrame.
 *
 * MediaPipe Hands landmarks (21 points):
 *   0  = WRIST
 *   4  = THUMB_TIP
 *   8  = INDEX_FINGER_TIP
 *   12 = MIDDLE_FINGER_TIP
 *   16 = RING_FINGER_TIP
 *   20 = PINKY_TIP
 *   (full map: https://mediapipe.dev/solutions/hands)
 */

const HandTracking = (() => {
  let hands, camera;
  let videoEl, mirrorCanvas, drawingCanvas;
  let mirrorCtx;
  let isRunning  = false;
  let lastLandmarks = null;

  // FPS tracking
  let fps = 0, fpsFrames = 0, fpsLast = performance.now();

  /* ── Init ── */
  function init(videoElement, mirrorCanvasEl, drawingCanvasEl) {
    videoEl        = videoElement;
    mirrorCanvas   = mirrorCanvasEl;
    drawingCanvas  = drawingCanvasEl;
    mirrorCtx      = mirrorCanvas.getContext('2d');

    setStatus('loading', 'Loading MediaPipe…');

    // Create MediaPipe Hands instance
    hands = new Hands({
      locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands:          1,
      modelComplexity:      1,   // 0=lite, 1=full
      minDetectionConfidence: 0.7,
      minTrackingConfidence:  0.6
    });

    hands.onResults(onResults);
  }

  /* ── Start camera ── */
  async function start() {
    if (isRunning) return;

    setStatus('loading', 'Requesting camera…');

    try {
      // Use MediaPipe Camera utility for optimal performance
      camera = new Camera(videoEl, {
        onFrame: async () => {
          await hands.send({ image: videoEl });
        },
        width:  1280,
        height: 720
      });
      await camera.start();
      isRunning = true;
      setStatus('ready', 'Hand tracking active');
    } catch (err) {
      console.error('[HandTracking] Camera error:', err);
      setStatus('error', 'Camera denied — check permissions');
    }
  }

  /* ── Stop camera ── */
  function stop() {
    if (camera) { camera.stop(); isRunning = false; }
  }

  /* ── MediaPipe results callback ── */
  function onResults(results) {
    updateFps();
    resizeMirror();

    // Draw webcam mirror (flipped)
    mirrorCtx.save();
    mirrorCtx.clearRect(0, 0, mirrorCanvas.width, mirrorCanvas.height);
    mirrorCtx.drawImage(results.image, 0, 0, mirrorCanvas.width, mirrorCanvas.height);
    mirrorCtx.restore();

    let landmarks = null;
    let handLabel = '—';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      landmarks = results.multiHandLandmarks[0];
      handLabel = results.multiHandedness?.[0]?.label ?? 'Hand';
      lastLandmarks = landmarks;

      // Draw skeleton overlay on mirror canvas
      drawSkeleton(landmarks);
    } else {
      lastLandmarks = null;
    }

    // Process gesture
    const { gesture, x, y } = GestureControl.process(
      landmarks,
      drawingCanvas.width,
      drawingCanvas.height
    );

    // Update finger cursor
    updateCursor(landmarks, gesture);

    // Update HUD & stats
    updateHUD(gesture);
    updateStats(handLabel, gesture);
  }

  /* ── Draw hand skeleton on mirror canvas ── */
  function drawSkeleton(landmarks) {
    const W = mirrorCanvas.width;
    const H = mirrorCanvas.height;

    // Connection pairs (MediaPipe hand connections)
    const connections = [
      [0,1],[1,2],[2,3],[3,4],       // Thumb
      [0,5],[5,6],[6,7],[7,8],       // Index
      [0,9],[9,10],[10,11],[11,12],  // Middle
      [0,13],[13,14],[14,15],[15,16],// Ring
      [0,17],[17,18],[18,19],[19,20],// Pinky
      [5,9],[9,13],[13,17]           // Palm
    ];

    mirrorCtx.save();
    mirrorCtx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    mirrorCtx.lineWidth   = 1.5;

    connections.forEach(([a, b]) => {
      const pa = landmarks[a], pb = landmarks[b];
      mirrorCtx.beginPath();
      // Mirror X because mirror canvas is CSS-flipped
      mirrorCtx.moveTo(pa.x * W, pa.y * H);
      mirrorCtx.lineTo(pb.x * W, pb.y * H);
      mirrorCtx.stroke();
    });

    // Draw dots at tips
    [4, 8, 12, 16, 20].forEach(idx => {
      const p = landmarks[idx];
      mirrorCtx.beginPath();
      mirrorCtx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
      mirrorCtx.fillStyle = 'rgba(255, 51, 102, 0.9)';
      mirrorCtx.fill();
    });

    mirrorCtx.restore();
  }

  /* ── Update finger cursor DOM element ── */
  function updateCursor(landmarks, gesture) {
    const cursor = document.getElementById('fingerCursor');
    if (!cursor) return;

    if (!landmarks) {
      cursor.style.display = 'none';
      return;
    }

    const tip = landmarks[8]; // Index fingertip
    const W = drawingCanvas.width;
    const H = drawingCanvas.height;

    // Mirror X to match drawing canvas
    const x = (1 - tip.x) * W;
    const y = tip.y * H;

    cursor.style.display  = 'block';
    cursor.style.left     = x + 'px';
    cursor.style.top      = y + 'px';
    cursor.className      = 'finger-cursor';

    if (gesture === 'ONE_FINGER')  cursor.classList.add('drawing');
    if (gesture === 'TWO_FINGERS') cursor.classList.add('paused');
  }

  /* ── HUD update ── */
  function updateHUD(gesture) {
    const hud   = document.getElementById('gestureHud');
    const label = document.getElementById('gestureLabel');
    if (!hud || !label) return;
    label.textContent = GestureControl.getLabel(gesture);
    hud.className = gesture !== 'NONE' && gesture !== 'FIST' ? 'gesture-hud active' : 'gesture-hud';
  }

  /* ── Stats panel update ── */
  function updateStats(hand, gesture) {
    const el = id => document.getElementById(id);
    if (el('statFps'))     el('statFps').textContent     = fps;
    if (el('statHand'))    el('statHand').textContent    = hand;
    if (el('statGesture')) el('statGesture').textContent = gesture;
  }

  /* ── FPS counter ── */
  function updateFps() {
    fpsFrames++;
    const now = performance.now();
    if (now - fpsLast >= 1000) {
      fps       = fpsFrames;
      fpsFrames = 0;
      fpsLast   = now;
    }
  }

  /* ── Resize mirror canvas to match parent ── */
  function resizeMirror() {
    const W = mirrorCanvas.parentElement.clientWidth;
    const H = mirrorCanvas.parentElement.clientHeight;
    if (mirrorCanvas.width !== W)  mirrorCanvas.width  = W;
    if (mirrorCanvas.height !== H) mirrorCanvas.height = H;
  }

  /* ── Status helper ── */
  function setStatus(type, text) {
    const dot   = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');
    if (dot)   { dot.className = 'status-dot ' + type; }
    if (label) { label.textContent = text; }
  }

  return { init, start, stop };
})();
