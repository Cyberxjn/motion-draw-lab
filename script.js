/**
 * script.js
 * ─────────────────────────────────────────────────────
 * App entry point.
 * - Initialises all modules
 * - Wires UI buttons to DrawingEngine
 * - Handles keyboard shortcuts
 * - Manages mouse/touch fallback input
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ── DOM References ── */
  const videoEl        = document.getElementById('webcamVideo');
  const mirrorCanvas   = document.getElementById('mirrorCanvas');
  const drawingCanvas  = document.getElementById('drawingCanvas');
  const overlay        = document.getElementById('onboardingOverlay');
  const btnStart       = document.getElementById('btnStartCamera');
  const btnUndo        = document.getElementById('btnUndo');
  const btnRedo        = document.getElementById('btnRedo');
  const btnSave        = document.getElementById('btnSave');
  const btnClear       = document.getElementById('btnClear');
  const toolBtns       = document.querySelectorAll('.tool-btn[data-mode]');
  const colorSwatches  = document.querySelectorAll('.color-swatch');
  const customColor    = document.getElementById('customColor');
  const strokeSize     = document.getElementById('strokeSize');
  const strokeSizeVal  = document.getElementById('strokeSizeVal');
  const strokeOpacity  = document.getElementById('strokeOpacity');
  const strokeOpacVal  = document.getElementById('strokeOpacityVal');

  /* ── Module Init ── */
  DrawingEngine.init(drawingCanvas);
  HandTracking.init(videoEl, mirrorCanvas, drawingCanvas);

  /* ── Camera Start ── */
  btnStart.addEventListener('click', async () => {
    overlay.classList.add('hidden');
    await HandTracking.start();
  });

  /* ── Tool Buttons ── */
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      DrawingEngine.setMode(btn.dataset.mode);
    });
  });

  /* ── Clear Button ── */
  btnClear.addEventListener('click', () => DrawingEngine.clear());

  /* ── Undo / Redo ── */
  btnUndo.addEventListener('click', () => DrawingEngine.undo());
  btnRedo.addEventListener('click', () => DrawingEngine.redo());

  /* ── Save ── */
  btnSave.addEventListener('click', () => DrawingEngine.saveImage());

  /* ── Color Swatches ── */
  colorSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const c = sw.dataset.color;
      DrawingEngine.setColor(c);
      customColor.value = c;
    });
  });

  customColor.addEventListener('input', e => {
    colorSwatches.forEach(s => s.classList.remove('active'));
    DrawingEngine.setColor(e.target.value);
  });

  /* ── Stroke Size ── */
  strokeSize.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    strokeSizeVal.textContent = v;
    DrawingEngine.setLineWidth(v);
  });

  /* ── Stroke Opacity ── */
  strokeOpacity.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    strokeOpacVal.textContent = v + '%';
    DrawingEngine.setOpacity(v / 100);
  });

  /* ── Keyboard Shortcuts ── */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); DrawingEngine.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); DrawingEngine.redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); DrawingEngine.saveImage(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { DrawingEngine.clear(); }
    // Mode shortcuts
    if (e.key === 'f') setToolMode('free');
    if (e.key === 'c') setToolMode('circle');
    if (e.key === 'q') setToolMode('square');
    if (e.key === 'l') setToolMode('line');
  });

  function setToolMode(mode) {
    toolBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    DrawingEngine.setMode(mode);
  }

  /* ══════════════════════════════════════════════════
     MOUSE / TOUCH FALLBACK
     Allows using the app without a webcam,
     directly drawing with mouse or finger touch
  ══════════════════════════════════════════════════ */

  let mouseDown = false;

  function getPos(e) {
    const rect = drawingCanvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top
    };
  }

  drawingCanvas.addEventListener('mousedown', e => {
    mouseDown = true;
    const { x, y } = getPos(e);
    DrawingEngine.startDraw(x, y);
  });

  drawingCanvas.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    const { x, y } = getPos(e);
    DrawingEngine.continueDraw(x, y);

    // Show native cursor position as finger cursor
    const cursor = document.getElementById('fingerCursor');
    if (cursor) {
      cursor.style.display = 'block';
      cursor.style.left    = x + 'px';
      cursor.style.top     = y + 'px';
      cursor.className     = 'finger-cursor drawing';
    }
  });

  drawingCanvas.addEventListener('mouseup', e => {
    if (!mouseDown) return;
    mouseDown = false;
    const { x, y } = getPos(e);
    DrawingEngine.endDraw(x, y);
    const cursor = document.getElementById('fingerCursor');
    if (cursor) cursor.style.display = 'none';
  });

  drawingCanvas.addEventListener('mouseleave', e => {
    if (!mouseDown) return;
    mouseDown = false;
    const { x, y } = getPos(e);
    DrawingEngine.endDraw(x, y);
  });

  // Touch support
  drawingCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const { x, y } = getPos(e);
    DrawingEngine.startDraw(x, y);
  }, { passive: false });

  drawingCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const { x, y } = getPos(e);
    DrawingEngine.continueDraw(x, y);
  }, { passive: false });

  drawingCanvas.addEventListener('touchend', e => {
    e.preventDefault();
    const last = e.changedTouches[0];
    const rect  = drawingCanvas.getBoundingClientRect();
    DrawingEngine.endDraw(
      last.clientX - rect.left,
      last.clientY - rect.top
    );
  }, { passive: false });

  /* ── Handle resize ── */
  window.addEventListener('resize', () => {
    drawingCanvas.width  = drawingCanvas.parentElement.clientWidth;
    drawingCanvas.height = drawingCanvas.parentElement.clientHeight;
  });

  console.log('%c✦ Motion Draw Lab loaded', 'color:#ff3366;font-size:14px;font-weight:bold;');
  console.log('%cShortcuts: F=free C=circle Q=square L=line  Ctrl+Z/Y=undo/redo  Ctrl+S=save', 'color:#6a6a7a');
});
