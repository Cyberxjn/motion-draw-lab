/**
 * script.js  ─ OPTIMIZED v2
 * ═══════════════════════════════════════════════════════
 * Changes:
 *  1. Erase tool button added + wired to DrawingEngine
 *  2. Mode indicator pill always reflects current mode
 *  3. Mouse/touch fallback also supports erase mode
 *  4. Keyboard shortcut E = erase mode
 *  5. Erase size slider wired to DrawingEngine.setEraseSize
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ── DOM ── */
  const videoEl       = document.getElementById('webcamVideo');
  const mirrorCanvas  = document.getElementById('mirrorCanvas');
  const drawingCanvas = document.getElementById('drawingCanvas');
  const overlay       = document.getElementById('onboardingOverlay');
  const btnStart      = document.getElementById('btnStartCamera');
  const btnUndo       = document.getElementById('btnUndo');
  const btnRedo       = document.getElementById('btnRedo');
  const btnSave       = document.getElementById('btnSave');
  const btnClear      = document.getElementById('btnClear');
  const toolBtns      = document.querySelectorAll('.tool-btn[data-mode]');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const customColor   = document.getElementById('customColor');
  const strokeSize    = document.getElementById('strokeSize');
  const strokeSizeVal = document.getElementById('strokeSizeVal');
  const strokeOpacity = document.getElementById('strokeOpacity');
  const strokeOpacVal = document.getElementById('strokeOpacityVal');
  const eraseSize     = document.getElementById('eraseSize');
  const eraseSizeVal  = document.getElementById('eraseSizeVal');

  /* ── Init modules ── */
  DrawingEngine.init(drawingCanvas);
  HandTracking.init(videoEl, mirrorCanvas, drawingCanvas);

  /* ── Camera start ── */
  btnStart?.addEventListener('click', async () => {
    overlay?.classList.add('hidden');
    await HandTracking.start();
  });

  /* ── Tool buttons ── */
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setToolMode(btn.dataset.mode);
    });
  });

  function setToolMode(mode) {
    toolBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    DrawingEngine.setMode(mode);
    // Update mode indicator pill
    const modeEl = document.getElementById('modeIndicator');
    if (modeEl) { modeEl.textContent = mode.toUpperCase(); modeEl.dataset.mode = mode; }
  }

  /* ── Erase size slider ── */
  if (eraseSize) {
    eraseSize.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      if (eraseSizeVal) eraseSizeVal.textContent = v + 'px';
      DrawingEngine.setEraseSize(v);
    });
  }

  /* ── Clear ── */
  btnClear?.addEventListener('click', () => DrawingEngine.clear());

  /* ── Undo / Redo ── */
  btnUndo?.addEventListener('click', () => DrawingEngine.undo());
  btnRedo?.addEventListener('click', () => DrawingEngine.redo());

  /* ── Save ── */
  btnSave?.addEventListener('click', () => DrawingEngine.saveImage());

  /* ── Color swatches ── */
  colorSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      DrawingEngine.setColor(sw.dataset.color);
      if (customColor) customColor.value = sw.dataset.color;
    });
  });

  if (customColor) {
    customColor.addEventListener('input', e => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      DrawingEngine.setColor(e.target.value);
    });
  }

  /* ── Stroke size ── */
  if (strokeSize) {
    strokeSize.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      if (strokeSizeVal) strokeSizeVal.textContent = v;
      DrawingEngine.setLineWidth(v);
    });
  }

  /* ── Stroke opacity ── */
  if (strokeOpacity) {
    strokeOpacity.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      if (strokeOpacVal) strokeOpacVal.textContent = v + '%';
      DrawingEngine.setOpacity(v / 100);
    });
  }

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); DrawingEngine.undo(); }
      if (e.key === 'y') { e.preventDefault(); DrawingEngine.redo(); }
      if (e.key === 's') { e.preventDefault(); DrawingEngine.saveImage(); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') DrawingEngine.clear();
    if (e.key === 'f') setToolMode('free');
    if (e.key === 'c') setToolMode('circle');
    if (e.key === 'q') setToolMode('square');
    if (e.key === 'l') setToolMode('line');
    if (e.key === 'e') setToolMode('erase');  // ★ NEW: E = erase
  });

  /* ══════════════════════════════════════════════
     MOUSE / TOUCH FALLBACK (no webcam)
  ══════════════════════════════════════════════ */
  let mouseDown = false;

  function getPos(e) {
    const rect = drawingCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  drawingCanvas.addEventListener('mousedown', e => {
    mouseDown = true;
    const { x, y } = getPos(e);
    DrawingEngine.startDraw(x, y);
    showCursor(x, y);
  });

  drawingCanvas.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    const { x, y } = getPos(e);
    DrawingEngine.continueDraw(x, y);
    showCursor(x, y);
  });

  drawingCanvas.addEventListener('mouseup', e => {
    if (!mouseDown) return;
    mouseDown = false;
    const { x, y } = getPos(e);
    DrawingEngine.endDraw(x, y);
    hideCursor();
  });

  drawingCanvas.addEventListener('mouseleave', () => {
    if (!mouseDown) return;
    mouseDown = false;
    DrawingEngine.endDraw(0, 0);
    hideCursor();
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
    const t = e.changedTouches[0];
    const rect = drawingCanvas.getBoundingClientRect();
    DrawingEngine.endDraw(t.clientX - rect.left, t.clientY - rect.top);
  }, { passive: false });

  function showCursor(x, y) {
    const c = document.getElementById('fingerCursor');
    if (!c) return;
    const isErase = DrawingEngine.getMode() === 'erase';
    c.style.display   = 'block';
    c.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
    c.className = 'finger-cursor' + (isErase ? ' erasing' : ' drawing');
  }

  function hideCursor() {
    const c = document.getElementById('fingerCursor');
    if (c) c.style.display = 'none';
  }

  /* ── Window resize ── */
  window.addEventListener('resize', () => {
    drawingCanvas.width  = drawingCanvas.parentElement.clientWidth;
    drawingCanvas.height = drawingCanvas.parentElement.clientHeight;
  });

  console.log('%c✦ Motion Draw Lab v2 — Optimized', 'color:#ff3366;font-size:14px;font-weight:bold');
  console.log('%cKeys: F=free  C=circle  Q=square  L=line  E=erase  Ctrl+Z/Y  Ctrl+S', 'color:#00e5ff');
});
