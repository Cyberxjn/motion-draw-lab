/**
 * drawingEngine.js
 * ─────────────────────────────────────────────────────
 * Manages the HTML5 Canvas drawing layer.
 * Supports: free draw, circle, square, line
 * Features: move, scale, undo/redo, color, opacity, size
 */

const DrawingEngine = (() => {
  /* ── State ── */
  let canvas, ctx;
  let mode        = 'free';     // 'free' | 'circle' | 'square' | 'line'
  let isDrawing   = false;
  let color       = '#ff3366';
  let lineWidth   = 5;
  let opacity     = 1.0;

  // Shape start point
  let startX = 0, startY = 0;
  // Free-draw path points (for smooth interpolation)
  let freePath = [];

  // Object list (for shapes that can be selected/moved)
  const objects   = [];     // Completed shape objects
  let activeObj   = null;   // Currently selected object
  let isDragging  = false;
  let dragOffX = 0, dragOffY = 0;

  // Snapshot for ghost preview while drawing shapes
  let snapshot    = null;

  // Undo / Redo stacks (ImageData snapshots)
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO  = 40;

  /* ── Init ── */
  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    // Save current image before resize
    const imgData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width  = w;
    canvas.height = h;
    if (imgData) ctx.putImageData(imgData, 0, 0);
  }

  /* ── Undo / Redo ── */
  function saveUndoState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // Clear redo on new action
    updateObjectCount();
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

  /* ── Clear ── */
  function clear() {
    saveUndoState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.length = 0;
    activeObj = null;
    updateObjectCount();
  }

  /* ── Drawing start ── */
  function startDraw(x, y) {
    if (isDrawing) return;
    isDrawing = true;
    startX = x; startY = y;
    freePath = [{ x, y }];
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setCtxStyle();

    if (mode === 'free') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }

  /* ── Drawing continue ── */
  function continueDraw(x, y) {
    if (!isDrawing) return;

    if (mode === 'free') {
      // Catmull-Rom smooth interpolation
      freePath.push({ x, y });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (snapshot) ctx.putImageData(snapshot, 0, 0);
      setCtxStyle();
      drawSmoothPath(freePath);
    } else {
      // Shape preview: restore snapshot, draw ghost shape
      ctx.putImageData(snapshot, 0, 0);
      setCtxStyle(0.5); // ghost opacity
      drawShape(mode, startX, startY, x, y);
    }
  }

  /* ── Drawing end ── */
  function endDraw(x, y) {
    if (!isDrawing) return;
    isDrawing = false;

    ctx.putImageData(snapshot, 0, 0);
    setCtxStyle();

    if (mode === 'free') {
      freePath.push({ x, y });
      drawSmoothPath(freePath);
    } else {
      drawShape(mode, startX, startY, x, y);
      // Register as moveable object
      objects.push({
        type: mode, x1: startX, y1: startY, x2: x, y2: y,
        color, lineWidth, opacity
      });
    }

    saveUndoState();
    snapshot = null;
    freePath = [];
    updateObjectCount();
  }

  /* ── Smooth free-draw path (Catmull-Rom → Bezier) ── */
  function drawSmoothPath(pts) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }

  /* ── Shape renderer ── */
  function drawShape(type, x1, y1, x2, y2) {
    const w = x2 - x1;
    const h = y2 - y1;

    ctx.beginPath();

    if (type === 'circle') {
      const rx = Math.abs(w) / 2;
      const ry = Math.abs(h) / 2;
      const cx = x1 + w / 2;
      const cy = y1 + h / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else if (type === 'square') {
      ctx.rect(x1, y1, w, h);
    } else if (type === 'line') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  /* ── Set canvas context style ── */
  function setCtxStyle(alphaOverride) {
    ctx.globalAlpha  = alphaOverride !== undefined ? alphaOverride : opacity;
    ctx.strokeStyle  = color;
    ctx.lineWidth    = lineWidth;
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ── Move object (two-finger gesture) ── */
  function startMove(x, y) {
    // Find topmost object under touch point
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      const cx = (o.x1 + o.x2) / 2;
      const cy = (o.y1 + o.y2) / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < Math.max(Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1)) / 2 + 30) {
        activeObj = o;
        isDragging = true;
        dragOffX = x - cx;
        dragOffY = y - cy;
        return;
      }
    }
  }

  function moveObject(x, y) {
    if (!isDragging || !activeObj) return;
    const hw = (activeObj.x2 - activeObj.x1) / 2;
    const hh = (activeObj.y2 - activeObj.y1) / 2;
    const cx = x - dragOffX;
    const cy = y - dragOffY;
    activeObj.x1 = cx - hw; activeObj.x2 = cx + hw;
    activeObj.y1 = cy - hh; activeObj.y2 = cy + hh;
    redrawObjects();
  }

  function endMove() {
    if (isDragging) {
      isDragging = false;
      saveUndoState();
    }
    activeObj = null;
  }

  /* ── Scale object (pinch gesture) ── */
  function scaleObject(scaleFactor) {
    if (!activeObj) return;
    const cx = (activeObj.x1 + activeObj.x2) / 2;
    const cy = (activeObj.y1 + activeObj.y2) / 2;
    const hw = ((activeObj.x2 - activeObj.x1) / 2) * scaleFactor;
    const hh = ((activeObj.y2 - activeObj.y1) / 2) * scaleFactor;
    activeObj.x1 = cx - hw; activeObj.x2 = cx + hw;
    activeObj.y1 = cy - hh; activeObj.y2 = cy + hh;
    redrawObjects();
  }

  /* ── Redraw all objects (for move/scale) ── */
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
      drawShape(o.type, o.x1, o.y1, o.x2, o.y2);
    });
    ctx.globalAlpha = 1;
  }

  /* ── Save as PNG ── */
  function saveImage() {
    const link = document.createElement('a');
    link.download = `motion-draw-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  /* ── Helpers ── */
  function updateObjectCount() {
    const el = document.getElementById('statObjects');
    if (el) el.textContent = objects.length;
  }

  /* ── Public API ── */
  return {
    init,
    startDraw, continueDraw, endDraw,
    startMove, moveObject, endMove, scaleObject,
    clear, undo, redo, saveImage,
    setMode:      v  => { mode      = v; },
    setColor:     v  => { color     = v; },
    setLineWidth: v  => { lineWidth = v; },
    setOpacity:   v  => { opacity   = v; },
    getMode:      () => mode,
    get isDrawing() { return isDrawing; }
  };
})();
