import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Bell,
  Activity,
  Settings,
  AlertCircle,
  History,
  TrendingUp,
} from "lucide-react";

export default function ObjectTrackingApp() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [detections, setDetections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [recentDetections, setRecentDetections] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [alertObjects, setAlertObjects] = useState([""]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [connectionStatus, setConnectionStatus] = useState("Ready");
  const [fps, setFps] = useState(0);

  const pollingIntervalRef = useRef(null);
  const abortControllerRef = useRef(null); // 🔥 NEW
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const canvasOverlayRef = useRef(null);
  const prevBoxesRef = useRef([]);
  const lastFrameTimeRef = useRef(Date.now());

  useEffect(() => {
    fetchStatistics();
    fetchRecentDetections();
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (isStreaming) startPolling();
    else stopPolling();
  }, [isStreaming]);

  const startPolling = async () => {
    setConnectionStatus("Streaming");

    // 🔥 New Abort Controller for new session
    abortControllerRef.current = new AbortController();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        videoRef.current.addEventListener("loadedmetadata", () => {
          if (canvasOverlayRef.current && videoRef.current) {
            const rect = videoRef.current.getBoundingClientRect();
            canvasOverlayRef.current.width = rect.width;
            canvasOverlayRef.current.height = rect.height;
          }
        });
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setConnectionStatus("Error");
      return;
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frameBase64 = canvas.toDataURL("image/jpeg").split(",")[1];

      try {
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/video/frame`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frame: frameBase64 }),
            signal: abortControllerRef.current?.signal, // 🔥 ABORT SIGNAL
          }
        );

        if (!response.ok) return;
        const data = await response.json();
        const dets = data.detections || [];
        setDetections(dets);

        // Trigger alerts
        dets.forEach((det) => {
          if (
            alertObjects.includes(det.objectType) &&
            det.confidence >= confidenceThreshold
          ) {
            addAlert({
              message: `Detected ${det.objectType} with ${(
                det.confidence * 100
              ).toFixed(1)}% confidence`,
              objectType: det.objectType,
              timestamp: new Date().toISOString(),
            });
          }
        });

        // Draw overlay boxes
        if (canvasOverlayRef.current) {
          const overlay = canvasOverlayRef.current;
          const ctxOverlay = overlay.getContext("2d");
          ctxOverlay.clearRect(0, 0, overlay.width, overlay.height);

          dets.forEach((det, idx) => {
            const box = det.boundingBox;
            const prevBox = prevBoxesRef.current[idx] || box;

            const x = prevBox.x + (box.x - prevBox.x) * 0.3;
            const y = prevBox.y + (box.y - prevBox.y) * 0.3;
            const width = prevBox.width + (box.width - prevBox.width) * 0.3;
            const height = prevBox.height + (box.height - prevBox.height) * 0.3;

            ctxOverlay.strokeStyle = "blue";
            ctxOverlay.lineWidth = 2;
            ctxOverlay.strokeRect(x, y, width, height);

            prevBoxesRef.current[idx] = { x, y, width, height };
          });
        }
      } catch (err) {
        if (err.name === "AbortError") {
          console.log("⛔ Request aborted.");
        } else {
          console.error("Error sending frame:", err);
        }
      }

      // FPS
      const now = Date.now();
      setFps(Math.round(1000 / (now - lastFrameTimeRef.current)));
      lastFrameTimeRef.current = now;
    }, 200);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    // 🔥 ABORT ALL IN-FLIGHT REQUESTS
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop video
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }

    setConnectionStatus("Ready");

    if (canvasOverlayRef.current) {
      const ctxOverlay = canvasOverlayRef.current.getContext("2d");
      ctxOverlay.clearRect(
        0,
        0,
        canvasOverlayRef.current.width,
        canvasOverlayRef.current.height
      );
    }

    prevBoxesRef.current = [];
  };

  const addAlert = (alert) => {
    setAlerts((prev) => {
      const duplicate = prev.some(
        (a) =>
          a.objectType === alert.objectType &&
          new Date() - new Date(a.timestamp) < 2000
      );
      if (duplicate) return prev;
      playBeep();
      return [alert, ...prev].slice(0, 10);
    });
  };

  const fetchStatistics = async () => {
    try {
      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/detections/statistics`
      );
      const data = await res.json();
      setStatistics(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRecentDetections = async () => {
    try {
      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/detections/recent?hours=24`
      );
      const data = await res.json();
      setRecentDetections(data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStream = () => {
    if (isStreaming) {
      stopPolling();
      setIsStreaming(false);
    } else {
      setIsStreaming(true);
    }
  };

  const updateAlertObjects = async () => {
    try {
      await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/config/alert-objects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertObjects),
        }
      );
      alert("Alert objects updated successfully");
    } catch (err) {
      console.error(err);
    }
  };

  const updateConfidence = async () => {
    try {
      await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/config/confidence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threshold: confidenceThreshold }),
        }
      );
      alert("Confidence threshold updated successfully");
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllDetections = async () => {
    if (window.confirm("Are you sure?")) {
      try {
        await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/detections/clear`,
          { method: "DELETE" }
        );
        fetchRecentDetections();
        fetchStatistics();
        setAlerts([]);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "Streaming":
        return "bg-green-500";
      case "Ready":
        return "bg-blue-500";
      case "Error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const playBeep = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Camera className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold">Real-time Object Tracking</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${getConnectionStatusColor()}`}
              ></div>
              <span className="text-sm text-gray-400">{connectionStatus}</span>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>
        </div>
        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label>Alert Objects (comma-separated)</label>
                <input
                  type="text"
                  value={alertObjects.join(", ")}
                  onChange={(e) =>
                    setAlertObjects(
                      e.target.value.split(",").map((s) => s.trim())
                    )
                  }
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                />
                <button
                  onClick={updateAlertObjects}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Update Alert Objects
                </button>
              </div>
              <div>
                <label>
                  Confidence Threshold: {confidenceThreshold.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) =>
                    setConfidenceThreshold(parseFloat(e.target.value))
                  }
                  className="w-full"
                />
                <button
                  onClick={updateConfidence}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Update Threshold
                </button>
              </div>
            </div>
            <button
              onClick={clearAllDetections}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
            >
              Clear All Detection History
            </button>
          </div>
        )}
        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5" /> Live Feed
                </h2>
                <button
                  onClick={toggleStream}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                    isStreaming
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {isStreaming ? "Stop Stream" : "Start Stream"}
                </button>
              </div>
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  autoPlay
                  muted
                  playsInline
                />
                <canvas
                  ref={canvasOverlayRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                />
                {isStreaming && (
                  <div className="absolute top-4 left-4 px-3 py-1 bg-red-600 rounded-full text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    LIVE
                  </div>
                )}
                {isStreaming && (
                  <div className="absolute bottom-4 left-4 px-2 py-1 bg-gray-800/50 rounded text-sm">
                    FPS: {fps}
                  </div>
                )}
              </div>
              {detections.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-2">
                    Current Detections
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {detections.map((det, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-gray-700 rounded flex justify-between"
                      >
                        <span className="font-semibold capitalize">
                          {det.objectType}
                        </span>
                        <span className="text-sm text-gray-400">
                          {(det.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className="bg-gray-800 rounded-lg p-4 mt-6">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                Detection Statistics
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.keys(statistics).length > 0 ? (
                  Object.entries(statistics).map(([key, value]) => (
                    <div key={key} className="p-3 bg-gray-700 rounded">
                      <div className="text-2xl font-bold text-blue-400">
                        {value}
                      </div>
                      <div className="text-sm text-gray-400 capitalize">
                        {key}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-4 text-center text-gray-500 py-4">
                    No statistics available yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Alerts & Recent Detections */}
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5" /> Recent Alerts
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No alerts yet
                  </p>
                ) : (
                  alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-red-900/30 border border-red-700 rounded"
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">
                            {alert.message}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <History className="w-5 h-5" /> Recent Detections
                </h2>
                <button
                  onClick={fetchRecentDetections}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentDetections.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No detections yet
                  </p>
                ) : (
                  recentDetections.slice(0, 20).map((det) => (
                    <div
                      key={det.id}
                      className="p-2 bg-gray-700 rounded text-sm"
                    >
                      <div className="flex justify-between items-center">
                        <span className="capitalize font-semibold">
                          {det.objectType}
                        </span>
                        <span className="text-gray-400">
                          {(det.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(det.detectedAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
