# Object Tracking Tool

Lightweight React frontend for a real-time object-tracking demo. Built with Create React App, the UI displays live frames, detection statistics, and lets you configure alert objects and confidence thresholds.

## Features
- Live video/frame display (streamed from backend)
- Detection statistics and recent detections
- Configure alert object classes and confidence threshold
- Start/stop stream and clear detections
- Sound alert on detections

## Requirements
- Node.js (12+ recommended)
- npm (bundled with Node.js)

## Quick start

1. Install dependencies
```bash
npm install
```

2. Configure backend URL  
Create or edit `.env` at the project root:
```
REACT_APP_BACKEND_URL=http://localhost:8000
```

3. Run (development)
```bash
npm start
```
Opens at http://localhost:3000 by default.

4. Build (production)
```bash
npm run build
```
Static assets are written to the `build/` folder.


## Backend API (expected endpoints)
The frontend calls the backend using REACT_APP_BACKEND_URL. Common endpoints:
- GET  /api/stream/frame
- POST /api/stream/start
- POST /api/stream/stop
- GET  /api/detections/statistics
- GET  /api/detections/recent
- POST /api/config/alert-objects
- POST /api/config/confidence
- POST /api/detections/clear

Ensure the backend supports CORS and these routes.

## Project structure (important files)
- public/ — HTML template and static manifest
- src/
  - index.js — app entry
  - App.js / App.css — top-level UI
  - component/ObjectTracking.jsx — main object-tracking UI and polling logic
  - reportWebVitals.js, setupTests.js, App.test.js

Build output: build/ (contains index.html, asset-manifest.json, static assets)

## Troubleshooting
- No frames/detections: verify REACT_APP_BACKEND_URL and backend availability.
- CORS/Network errors: check browser console and backend CORS config.
- App fails to start: re-run `npm install`, ensure Node/npm versions.

## Notes
- This repo is scaffolded with Create React App.
- Adjust environment variables and endpoints to match your backend.