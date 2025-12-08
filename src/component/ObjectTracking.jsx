import React, { useState, useEffect, useRef } from 'react';
import { Camera, Bell, Activity, Settings, AlertCircle, TrendingUp, History } from 'lucide-react';

export default function ObjectTrackingApp() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [frame, setFrame] = useState(null);
    const [detections, setDetections] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [recentDetections, setRecentDetections] = useState([]);
    const [showSettings, setShowSettings] = useState(false);
    const [alertObjects, setAlertObjects] = useState([""]);
    const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
    const [connectionStatus, setConnectionStatus] = useState('Ready');
    const pollingIntervalRef = useRef(null);
    const alertCheckRef = useRef(null);

    useEffect(() => {
        fetchStatistics();
        fetchRecentDetections();

        return () => {
            stopPolling();
        };
    }, []);

    useEffect(() => {
        if (isStreaming) {
            startPolling();
        } else {
            stopPolling();
        }
    }, [isStreaming]);

    const startPolling = () => {
        setConnectionStatus('Streaming');


        pollingIntervalRef.current = setInterval(async () => {
            try {
                const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/stream/frame`);
                if (response.ok) {
                    const data = await response.json();
                    setFrame(`data:image/jpeg;base64,${data.frameBase64}`);
                    setDetections(data.detections || []);


                    if (data.alertTriggered && data.detections) {
                        data.detections.forEach(det => {
                            if (det.confidence >= 0.5) {
                                addAlert({
                                    message: `Detected ${det.objectType} with ${(det.confidence * 100).toFixed(1)}% confidence`,
                                    objectType: det.objectType,
                                    confidence: det.confidence,
                                    timestamp: new Date().toISOString(),
                                    severity: 'HIGH'
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error fetching frame:', error);
            }
        }, 100);

        // Refresh statistics every 5 seconds
        alertCheckRef.current = setInterval(() => {
            fetchStatistics();
            fetchRecentDetections();
        }, 5000);
    };

    const stopPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        if (alertCheckRef.current) {
            clearInterval(alertCheckRef.current);
            alertCheckRef.current = null;
        }
        setConnectionStatus('Ready');
    };

    const addAlert = (alert) => {
        setAlerts(prev => {
            // Avoid duplicate alerts within 2 seconds
            const isDuplicate = prev.some(a =>
                a.objectType === alert.objectType &&
                (new Date() - new Date(a.timestamp)) < 2000
            );
            if (isDuplicate) return prev;
            return [alert, ...prev].slice(0, 10);
        });
    };

    const fetchStatistics = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/detections/statistics`);
            const data = await response.json();
            setStatistics(data);
        } catch (error) {
            console.error('Error fetching statistics:', error);
        }
    };

    const fetchRecentDetections = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/detections/recent?hours=24`);
            const data = await response.json();
            setRecentDetections(data);
        } catch (error) {
            console.error('Error fetching recent detections:', error);
        }
    };

    const toggleStream = async () => {
        try {
            const endpoint = isStreaming ? 'stop' : 'start';
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/stream/${endpoint}`, {
                method: 'POST'
            });
            if (response.ok) {
                setIsStreaming(!isStreaming);
                if (!isStreaming) {
                    fetchStatistics();
                    fetchRecentDetections();
                }
            }
        } catch (error) {
            console.error('Error toggling stream:', error);
        }
    };

    const updateAlertObjects = async () => {
        try {
            await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/config/alert-objects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(alertObjects)
            });
            alert('Alert objects updated successfully');
        } catch (error) {
            console.error('Error updating alert objects:', error);
        }
    };

    const updateConfidence = async () => {
        try {
            await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/config/confidence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threshold: confidenceThreshold })
            });
            alert('Confidence threshold updated successfully');
        } catch (error) {
            console.error('Error updating confidence:', error);
        }
    };

    const clearAllDetections = async () => {
        if (window.confirm('Are you sure you want to clear all detection history?')) {
            try {
                await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/detections/clear`, {
                    method: 'DELETE'
                });
                fetchRecentDetections();
                fetchStatistics();
                setAlerts([]);
            } catch (error) {
                console.error('Error clearing detections:', error);
            }
        }
    };

    const getConnectionStatusColor = () => {
        switch (connectionStatus) {
            case 'Streaming': return 'bg-green-500';
            case 'Ready': return 'bg-blue-500';
            case 'Error': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    const playBeep = () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(600, audioCtx.currentTime); // Hz
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2); // play for 0.2 seconds
    };

    useEffect(() => {
        if (detections.length === 0) return;

        const hasAlertObject = detections.some(detection =>
            alertObjects.includes(detection.objectType)
        );

        if (hasAlertObject) {
            playBeep();
        }
    }, [detections, alertObjects]);

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
                            <div className={`w-3 h-3 rounded-full ${getConnectionStatusColor()}`}></div>
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

                {showSettings && (
                    <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4">Settings</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block mb-2">Alert Objects (comma-separated)</label>
                                <input
                                    type="text"
                                    value={alertObjects?alertObjects.join(', '):''}
                                    onChange={(e) => setAlertObjects(e.target.value.split(',').map(s => s.trim()))}
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
                                <label className="block mb-2">Confidence Threshold: {confidenceThreshold.toFixed(2)}</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={confidenceThreshold}
                                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Video Feed */}
                    <div className="lg:col-span-2">
                        <div className="bg-gray-800 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <Activity className="w-5 h-5" />
                                    Live Feed
                                </h2>
                                <button
                                    onClick={toggleStream}
                                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                                        isStreaming
                                            ? 'bg-red-600 hover:bg-red-700'
                                            : 'bg-green-600 hover:bg-green-700'
                                    }`}
                                >
                                    {isStreaming ? 'Stop Stream' : 'Start Stream'}
                                </button>
                            </div>

                            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                                {frame ? (
                                    <img src={frame} alt="Live feed" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                                        <div className="text-center">
                                            <Camera className="w-16 h-16 mx-auto mb-2" />
                                            <p>Click "Start Stream" to begin</p>
                                        </div>
                                    </div>
                                )}
                                {isStreaming && (
                                    <div className="absolute top-4 left-4 px-3 py-1 bg-red-600 rounded-full text-sm font-semibold flex items-center gap-2">
                                        <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                        LIVE
                                    </div>
                                )}
                            </div>

                            {/* Current Detections */}
                            {detections.length > 0 && (
                                <div className="mt-4">
                                    <h3 className="text-lg font-semibold mb-2">Current Detections</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {detections.map((det, idx) => (
                                            <div key={idx} className="p-2 bg-gray-700 rounded">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-semibold capitalize">{det.objectType}</span>
                                                    <span className="text-sm text-gray-400">
                            {(det.confidence * 100).toFixed(1)}%
                          </span>
                                                </div>
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
                                            <div className="text-2xl font-bold text-blue-400">{value}</div>
                                            <div className="text-sm text-gray-400 capitalize">{key}</div>
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

                    {/* Alerts & History Sidebar */}
                    <div className="space-y-6">
                        {/* Alerts */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                                <Bell className="w-5 h-5" />
                                Recent Alerts
                            </h2>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {alerts.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No alerts yet</p>
                                ) : (
                                    alerts.map((alert, idx) => (
                                        <div key={idx} className="p-3 bg-red-900/30 border border-red-700 rounded">
                                            <div className="flex items-start gap-2">
                                                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-semibold">{alert.message}</p>
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
                                    <History className="w-5 h-5" />
                                    Recent Detections
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
                                    <p className="text-gray-500 text-center py-4">No detections yet</p>
                                ) : (
                                    recentDetections.slice(0, 20).map((det) => (
                                        <div key={det.id} className="p-2 bg-gray-700 rounded text-sm">
                                            <div className="flex justify-between items-center">
                                                <span className="capitalize font-semibold">{det.objectType}</span>
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