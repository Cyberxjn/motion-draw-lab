# ✦ Motion Draw Lab

> **Browser-based hand gesture drawing app** — no plugins, no hardware, no backend.

Draw in the air with your hand. Uses your webcam + MediaPipe Hands for real-time finger tracking.

---
## under maintenance die to some fault
## 🖥 Live Demo

Deploy to GitHub Pages: `https://Cyberxjn.github.io/motion-draw-lab`

---

## 🎯 Features

| Feature | Details |
|---|---|
| Hand tracking | MediaPipe Hands (21 landmarks, ~30 fps) |
| Draw modes | Free draw, Circle, Square, Line |
| Gesture control | 1 finger = draw · 2 fingers = move · fist = stop |
| Pinch scaling | Thumb + index pinch to scale shapes |
| Undo / Redo | Up to 40 steps (Ctrl+Z / Ctrl+Y) |
| Color palette | 8 presets + custom color picker |
| Stroke control | Size (1–40px) + Opacity (10–100%) |
| Mouse fallback | Draw with mouse if no webcam available |
| Save as PNG | Download drawing with one click |
| Keyboard shortcuts | F=free C=circle Q=square L=line |

---

## 📁 Project Structure

```
motion-draw-lab/
│── index.html          # App shell, layout, UI
│── style.css           # Dark industrial theme
│── script.js           # App init, UI wiring, mouse fallback
│── js/
│   ├── drawingEngine.js   # Canvas drawing, undo/redo, shapes
│   ├── gestureControl.js  # Gesture classification + commands
│   └── handTracking.js    # MediaPipe setup, webcam, skeleton
│── assets/             # (optional: icons, favicons)
└── README.md
```

---

## ⚙️ How It Works

### 1. Webcam Access
`navigator.mediaDevices.getUserMedia` is called by MediaPipe's `Camera` utility. The browser shows a permission prompt. Video is streamed to a hidden `<video>` element at 1280×720.

### 2. Hand Tracking (MediaPipe Hands)
Each video frame is sent to `hands.send({ image: videoEl })`. MediaPipe returns an array of 21 normalized (x, y, z) landmarks per hand. No data ever leaves the browser — all ML inference runs locally via WebAssembly.

### 3. Gesture Classification (`gestureControl.js`)
Each landmark's fingertip Y-position is compared to its corresponding MCP joint to determine if a finger is "up". The combination of up/down fingers maps to a named gesture:
- `ONE_FINGER` → index up only → **draw**
- `TWO_FINGERS` → index + middle up → **move**
- `PINCH` → thumb + index close → **scale**
- `OPEN_HAND` → all up → **pause**
- `FIST` → all down → **idle**

A 3-frame debounce prevents jitter.

### 4. Drawing (`drawingEngine.js`)
The drawing canvas sits on top of the webcam mirror. Gestures call `startDraw / continueDraw / endDraw`. Free draw uses Catmull-Rom → quadratic Bézier interpolation for smooth strokes. Shapes (circle/square/line) show a ghost preview while being drawn, then commit on finger release. Every committed action saves an `ImageData` snapshot to the undo stack.

### 5. Canvas Layers
```
[Grid background CSS]
  └── mirrorCanvas     (opacity 8% — webcam reflection)
      └── drawingCanvas (your art)
          └── fingerCursor div (CSS dot tracking index tip)
```

---


### Step 3: Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Source**, select: `Deploy from a branch`
4. Branch: `main` / Folder: `/ (root)`
5. Click **Save**

### Step 4: Access Your App

After ~1–2 minutes:
```
https://Cyberxjn.github.io/motion-draw-lab
```

---

## 🔐 Privacy & Security

- **Zero backend** — no server, no database, no API keys
- **No data transmission** — all ML runs locally in the browser via WebAssembly
- **Camera permission** — requested once, revocable anytime in browser settings
- MediaPipe model files are loaded from jsDelivr CDN (cached locally after first load)

---

## 🖥 Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 88+ | ✅ Full |
| Edge 88+   | ✅ Full |
| Firefox 90+| ⚠️ Works (MediaPipe may be slower) |
| Safari 15+ | ⚠️ Partial (getUserMedia requires HTTPS) |
| Mobile Chrome | ✅ Works (use mouse/touch fallback) |

> **Note:** GitHub Pages serves over HTTPS by default, which is required for webcam access.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `F` | Free draw mode |
| `C` | Circle mode |
| `Q` | Square mode |
| `L` | Line mode |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save as PNG |
| `Delete` | Clear canvas |

---

## 🛠 Local Development (Kali Linux)

Since webcam access requires HTTPS or localhost, use a local server:

```bash
# Python (built-in)
cd motion-draw-lab
python3 -m http.server 8080
# Open: http://localhost:8080

# Node.js (if installed)
npx serve .
```

Do **not** open `index.html` directly with `file://` — camera access will be blocked by the browser.

---

## 📝 License

MIT — free to use , modify , and deploy.
