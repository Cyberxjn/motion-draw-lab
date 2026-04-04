/**
 * drawingEngine.js  ─ OPTIMIZED v2
 * ═══════════════════════════════════════════════════════
 * KEY CHANGES from v1:
 *  1. FREE DRAW is now INCREMENTAL — only draws NEW segment,
 *     never clears/repaints entire canvas → massive speed boost
 *  2. ERASE mode uses 'destination-out' compositing — true pixel
 *     erasure with no full-canvas rebuild
 *  3. EMA (Exponential Moving Average) smoothing on ALL
 *     coordinates — kills hand-jitter at the source
 *  4. getImageData (snapshot) ONLY taken for shape-preview modes,
 *     never for free-draw — getImageData was the #1 perf killer
 *  5. DOM updates throttled via rAF to avoid layout thrashing
 *  6. willReadFrequently: true on context — browser keeps canvas
 *     in CPU-accessible memory, faster getImageData calls
 */

const DrawingEngine = (() => {

  /* ── Canvas & Context ── */
  let canvas, ctx;

  /* ── Draw State ── */
  let mode      = 'free';   // 'free' | 'circle' | 'square' | 'line' | 'erase'
  let isDrawing = false;
  let color     = '#ff3366';
  let lineWidth = 5;
  let opacity   = 1.0;
  let eraseSize = 30;       // Eraser radius in px

  /* ── Shape drawing helpers ── */
  let startX = 0, startY = 0;
  let lastX  = 0, lastY  = 0;   // Last confirmed point (incremental free draw)
  let snapshot = null;           // Only used for shape ghost preview

  /* ── Objects list (shapes only, for move/scale) ── */
  const objects  = [];
  let activeObj  = null;
  let isDragging = false;
  let dragOffX   = 0, dragOffY = 0;

  /* ── Undo / Redo ── */
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO  = 30;

  /* ═══════════════════════════════════════════════
     EMA SMOOTHING — reduces hand tracking jitter
     α = 0.4 feels responsive yet stable
  ═══════════════════════════════════════════════ */
  const SMOOTH_ALPHA = 0.4;
  let smoothX = null, smoothY = null;

  function smoothCoord(rawX, rawY) {
    if (smoothX === null) { smoothX = rawX; smoothY = rawY; }
    smoothX = SMOOTH_ALPHA * rawX + (1 - SMOOTH_ALPHA) * smoothX;
    smoothY = SMOOTH_ALPHA * rawY + (1 - SMOOTH_ALPHA) * smoothY;
    return { x: smoothX, y: smoothY };
  }

  function resetSmooth() { smoothX = null; smoothY = null; }

  /* ═══════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════ */
  function init(canvasEl) {
    canvas = canvasEl;
    // willReadFrequently: true → browser keeps pixels in CPU memory
    // makes getImageData ~3× faster
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    if (canvas.width === w && canvas.height === h) return;
    const img = (canvas.width > 0 && canvas.height > 0)
      ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width  = w;
    canvas.height = h;
    if (img) ctx.putImageData(img, 0, 0);
  }

  /* ═══════════════════════════════════════════════
     UNDO / REDO
  ═══════════════════════════════════════════════ */
  function saveUndoState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    scheduleObjCount();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(undoStack.pop(), 0, 0);
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoStack.pop(), 0, 0);
  }

  /* ═══════════════════════════════════════════════
     CLEAR
  ═══════════════════════════════════════════════ */
  function clear() {
    saveUndoState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.length = 0;
    activeObj = null;
    scheduleObjCount();
  }

  /* ═══════════════════════════════════════════════
     DRAW — START
  ═══════════════════════════════════════════════ */
  function startDraw(rawX, rawY) {
    if (isDrawing) return;
    resetSmooth();
    const { x, y } = smoothCoord(rawX, rawY);
    isDrawing = true;
    startX = x; startY = y;
    lastX  = x; lastY  = y;

    if (mode === 'erase') return; // Erase is fully incremental, no setup needed

    if (mode === 'free') {
      // INCREMENTAL mode — just position the pen, NO snapshot
      setCtxStyle();
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      // Shape modes — need snapshot for live preview ghost
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }

  /* ═══════════════════════════════════════════════
     DRAW — CONTINUE
     Called every hand-tracking frame (~30fps from MediaPipe)
  ═══════════════════════════════════════════════ */
  function continueDraw(rawX, rawY) {
    if (!isDrawing) return;
    const { x, y } = smoothCoord(rawX, rawY);

    if (mode === 'erase') {
      // destination-out: paints "transparent holes" into the canvas
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, eraseSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
      ctx.restore();
      lastX = x; lastY = y;
      return;
    }

    if (mode === 'free') {
      // ★ KEY OPTIMIZATION: only draw the new micro-segment
      // Instead of: clearRect → putImageData → redraw whole path
      // We just: moveTo(lastX,lastY) → quadraticCurveTo(…) → stroke
      // This is O(1) per frame instead of O(n) — massive win!
      setCtxStyle();
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      const mx = (lastX + x) / 2;
      const my = (lastY + y) / 2;
      ctx.quadraticCurveTo(lastX, lastY, mx, my);
      ctx.stroke();
      lastX = x; lastY = y;
    } else {
      // Shape ghost preview: restore snapshot → draw semi-transparent shape
      ctx.putImageData(snapshot, 0, 0);
      setCtxStyle(0.45);
      drawShape(mode, startX, startY, x, y);
    }
  }

  /* ═══════════════════════════════════════════════
     DRAW — END
  ═══════════════════════════════════════════════ */
  function endDraw(rawX, rawY) {
    if (!isDrawing) return;
    isDrawing = false;
    const { x, y } = smoothCoord(rawX, rawY);

    if (mode === 'erase') {
      saveUndoState();
      resetSmooth();
      return;
    }

    if (mode === 'free') {
      setCtxStyle();
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.putImageData(snapshot, 0, 0);
      setCtxStyle();
      drawShape(mode, startX, startY, x, y);
      objects.push({ type: mode, x1: startX, y1: startY, x2: x, y2: y, color, lineWidth, opacity });
      snapshot = null;
    }

    saveUndoState();
    resetSmooth();
    scheduleObjCount();
  }

  /* ═══════════════════════════════════════════════
     SHAPE RENDERER
  ═══════════════════════════════════════════════ */
  function drawShape(type, x1, y1, x2, y2) {
    const w = x2 - x1, h = y2 - y1;
    ctx.beginPath();
    if (type === 'circle') {
      ctx.ellipse(x1 + w/2, y1 + h/2, Math.abs(w)/2, Math.abs(h)/2, 0, 0, Math.PI * 2);
    } else if (type === 'square') {
      ctx.rect(x1, y1, w, h);
    } else if (type === 'line') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  /* ═══════════════════════════════════════════════
     CONTEXT STYLE SETTER
  ═══════════════════════════════════════════════ */
  function setCtxStyle(alphaOverride) {
    ctx.globalAlpha              = alphaOverride ?? opacity;
    ctx.strokeStyle              = color;
    ctx.fillStyle                = color;
    ctx.lineWidth                = lineWidth;
    ctx.lineCap                  = 'round';
    ctx.lineJoin                 = 'round';
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ═══════════════════════════════════════════════
     MOVE / SCALE  (two-finger gesture)
  ═══════════════════════════════════════════════ */
  function startMove(rawX, rawY) {
    const { x, y } = smoothCoord(rawX, rawY);
    for (let i = objects.length - 1; i >= 0; i--) {
      const o  = objects[i];
      const cx = (o.x1 + o.x2) / 2;
      const cy = (o.y1 + o.y2) / 2;
      if (Math.hypot(x - cx, y - cy) < Math.max(Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1)) / 2 + 30) {
        activeObj = o; isDragging = true;
        dragOffX = x - cx; dragOffY = y - cy;
        return;
      }
    }
  }

  function moveObject(rawX, rawY) {
    if (!isDragging || !activeObj) return;
    const { x, y } = smoothCoord(rawX, rawY);
    const hw = (activeObj.x2 - activeObj.x1) / 2;
    const hh = (activeObj.y2 - activeObj.y1) / 2;
    const cx = x - dragOffX, cy = y - dragOffY;
    activeObj.x1 = cx - hw; activeObj.x2 = cx + hw;
    activeObj.y1 = cy - hh; activeObj.y2 = cy + hh;
    redrawObjects();
  }

  function endMove() {
    if (isDragging) { isDragging = false; saveUndoState(); }
    activeObj = null; resetSmooth();
  }

  function scaleObject(factor) {
    if (!activeObj) return;
    const cx = (activeObj.x1 + activeObj.x2) / 2;
    const cy = (activeObj.y1 + activeObj.y2) / 2;
    const hw = ((activeObj.x2 - activeObj.x1) / 2) * factor;
    const hh = ((activeObj.y2 - activeObj.y1) / 2) * factor;
    activeObj.x1 = cx - hw; activeObj.x2 = cx + hw;
    activeObj.y1 = cy - hh; activeObj.y2 = cy + hh;
    redrawObjects();
  }

  function redrawObjects() {
    if (undoStack.length > 0) {
      ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    objects.forEach(o => {
      ctx.globalAlpha = o.opacity;
      ctx.strokeStyle = o.color;
      ctx.lineWidth   = o.lineWidth;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.globalCompositeOperation = 'source-over';
      drawShape(o.type, o.x1, o.y1, o.x2, o.y2);
    });
    ctx.globalAlpha = 1;
  }

  /* ═══════════════════════════════════════════════
     SAVE AS PNG
  ═══════════════════════════════════════════════ */
  function saveImage() {
    const link    = document.createElement('a');
    link.download = `motion-draw-${Date.now()}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  }

  /* ═══════════════════════════════════════════════
     DOM COUNT — THROTTLED (avoids layout thrash)
  ═══════════════════════════════════════════════ */
  let countTimer = null;
  function scheduleObjCount() {
    if (countTimer) return;
    countTimer = requestAnimationFrame(() => {
      const el = document.getElementById('statObjects');
      if (el) el.textContent = objects.length;
      countTimer = null;
    });
  }

  /* ── Public API ── */
  return {
    init,
    startDraw, continueDraw, endDraw,
    startMove, moveObject, endMove, scaleObject,
    clear, undo, redo, saveImage,
    setMode:      v => { mode      = v; },
    setColor:     v => { color     = v; },
    setLineWidth: v => { lineWidth = v; },
    setOpacity:   v => { opacity   = v; },
    setEraseSize: v => { eraseSize = v; },
    getMode:      () => mode,
    get isDrawing() { return isDrawing; }
  };
})();
