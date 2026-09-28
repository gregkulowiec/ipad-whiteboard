import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Pen, 
  Eraser, 
  RotateCcw, 
  RotateCw, 
  Trash2, 
  Tv, 
  Tablet, 
  Wifi, 
  WifiOff, 
  QrCode, 
  Copy, 
  Check, 
  Maximize, 
  Eye, 
  Sliders, 
  Pencil, 
  Layers, 
  Info,
  Sparkles,
  Share2
} from 'lucide-react';

// 16:9 Aspect Ratio Constants
const CANVAS_ASPECT_RATIO = 16 / 9;
const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

// Default Colors Palette
const COLORS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Yellow', hex: '#F59E0B' },
  { name: 'Black', hex: '#09090B' },
];

// Utility: Generate random short room ID
const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const QuickQRCode = ({ value, size = 180 }) => {
  const qrCanvasRef = useRef(null);

  useEffect(() => {
    // Generate QR code using quick-chart/qr standard API or lightweight inline rendering
    if (!qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Fallback visually appealing QR-like graphic + QR Image overlay
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=000000&bgborders=1`;
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
    };
    img.onerror = () => {
      // Emergency visual fallback if offline
      ctx.fillStyle = '#18181B';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#6366F1';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scan URL:', size / 2, size / 2 - 10);
      ctx.fillStyle = '#A1A1AA';
      ctx.fillText(value.substring(0, 22) + '...', size / 2, size / 2 + 10);
    };
  }, [value, size]);

  return (
    <div className="p-3 bg-white rounded-2xl shadow-2xl flex flex-col items-center">
      <canvas ref={qrCanvasRef} width={size} height={size} className="rounded-lg" />
    </div>
  );
};

export default function App() {
  // URL Parameters setup
  const [role, setRole] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('role') || 'select'; // 'host' (iPad), 'display' (Desktop/Projector), or 'select'
  });

  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || generateRoomId();
  });

  // Peer & Connection state
  const [peerStatus, setPeerStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const [peerId, setPeerId] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectionLog, setConnectionLog] = useState('Ready to connect.');
  const [pencilOnlyMode, setPencilOnlyMode] = useState(true); // Palm rejection default ON

  // Drawing Tools State (Host)
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#FFFFFF');
  const [baseWidth, setBaseWidth] = useState(4);
  const [eraserWidth, setEraserWidth] = useState(30);

  // Drawing Memory & Canvas references
  const [strokes, setStrokes] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  
  const canvasRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    // Dynamically load PeerJS library
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      initPeerJS();
    };

    return () => {
      if (peerRef.current) peerRef.current.destroy();
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [role, roomId]);

  const initPeerJS = () => {
    if (!window.Peer) return;

    if (peerRef.current) {
      peerRef.current.destroy();
    }

    // Role-based peer initialization
    // Display gets the predictable peer ID: whiteboard-room-{roomId}
    // Host connects to whiteboard-room-{roomId}
    const displayPeerId = `vibe-board-room-${roomId.toLowerCase()}`;

    if (role === 'display') {
      setConnectionLog('Initializing Display server...');
      const peer = new window.Peer(displayPeerId, {
        debug: 1,
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        setPeerStatus('connecting');
        setConnectionLog('Waiting for iPad to connect...');
      });

      peer.on('connection', (conn) => {
        connRef.current = conn;
        setPeerStatus('connected');
        setConnectionLog('iPad connected!');

        conn.on('data', (data) => {
          handleIncomingData(data);
        });

        conn.on('close', () => {
          setPeerStatus('connecting');
          setConnectionLog('iPad disconnected. Waiting for reconnect...');
        });
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setConnectionLog(`Peer error: ${err.type}`);
        // If ID taken, switch to listening anyway
        if (err.type === 'unavailable-id') {
          setPeerStatus('connecting');
        }
      });

    } else if (role === 'host') {
      setConnectionLog('Connecting to Desktop Projector...');
      const peer = new window.Peer(); // Host gets random peer ID
      peerRef.current = peer;

      peer.on('open', () => {
        setPeerStatus('connecting');
        connectToDisplay(displayPeerId);
      });

      peer.on('error', (err) => {
        console.error('Host peer error:', err);
        setConnectionLog(`Connection error: ${err.type}`);
      });
    }
  };

  const connectToDisplay = (targetDisplayId) => {
    if (!peerRef.current) return;
    setConnectionLog(`Searching for room ${roomId}...`);

    const conn = peerRef.current.connect(targetDisplayId, {
      reliable: true,
    });

    connRef.current = conn;

    conn.on('open', () => {
      setPeerStatus('connected');
      setConnectionLog('Connected to Desktop Projector!');
      
      // Sync full state upon connection
      sendDataToPeer({ type: 'FULL_SYNC', strokes });
    });

    conn.on('data', (data) => {
      handleIncomingData(data);
    });

    conn.on('close', () => {
      setPeerStatus('disconnected');
      setConnectionLog('Disconnected from Display.');
    });
  };

  // Broadcast data helper
  const sendDataToPeer = (data) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send(data);
    }
  };

  const handleIncomingData = (data) => {
    switch (data.type) {
      case 'STROKE_START':
        currentStrokeRef.current = data.stroke;
        renderCanvas();
        break;

      case 'STROKE_MOVE':
        if (currentStrokeRef.current) {
          currentStrokeRef.current.points.push(data.point);
          renderCanvas();
        }
        break;

      case 'STROKE_END':
        if (currentStrokeRef.current) {
          setStrokes((prev) => [...prev, currentStrokeRef.current]);
          currentStrokeRef.current = null;
          setRedoStack([]);
          renderCanvas();
        }
        break;

      case 'UNDO':
        setStrokes((prev) => {
          if (prev.length === 0) return prev;
          const newStrokes = [...prev];
          const popped = newStrokes.pop();
          setRedoStack((r) => [...r, popped]);
          return newStrokes;
        });
        break;

      case 'REDO':
        setRedoStack((prev) => {
          if (prev.length === 0) return prev;
          const newRedo = [...prev];
          const restored = newRedo.pop();
          setStrokes((s) => [...s, restored]);
          return newRedo;
        });
        break;

      case 'CLEAR':
        setStrokes([]);
        setRedoStack([]);
        currentStrokeRef.current = null;
        renderCanvas();
        break;

      case 'FULL_SYNC':
        setStrokes(data.strokes || []);
        renderCanvas();
        break;

      default:
        break;
    }
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.fillStyle = '#09090B'; // Dark Slate background
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // Draw grid guide pattern (subtle blueprint dots)
    ctx.fillStyle = '#27272A';
    const gridSize = 40;
    for (let x = gridSize; x < VIRTUAL_WIDTH; x += gridSize) {
      for (let y = gridSize; y < VIRTUAL_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Combine finalized strokes + active stroke
    const allStrokes = [...strokes];
    if (currentStrokeRef.current) {
      allStrokes.push(currentStrokeRef.current);
    }

    // Render each stroke
    allStrokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        ctx.strokeStyle = '#09090B';
      } else {
        ctx.strokeStyle = stroke.color;
      }

      const pts = stroke.points;

      if (pts.length === 1) {
        // Draw single dot
        const p = pts[0];
        const rad = ((p.pressure || 0.5) * stroke.width) / 2;
        ctx.fillStyle = stroke.tool === 'eraser' ? '#09090B' : stroke.color;
        ctx.beginPath();
        ctx.arc(p.x * VIRTUAL_WIDTH, p.y * VIRTUAL_HEIGHT, rad, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Dynamic variable line-width rendering with quadratic smooth curves
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];

          const prevX = prev.x * VIRTUAL_WIDTH;
          const prevY = prev.y * VIRTUAL_HEIGHT;
          const currX = curr.x * VIRTUAL_WIDTH;
          const currY = curr.y * VIRTUAL_HEIGHT;

          // Dynamic line width based on recorded stylus pressure
          const effectiveWidth = Math.max(1, (curr.pressure || 0.5) * stroke.width * 1.8);

          ctx.beginPath();
          ctx.lineWidth = effectiveWidth;
          ctx.moveTo(prevX, prevY);

          if (i < pts.length - 1) {
            const next = pts[i + 1];
            const midX = (currX + next.x * VIRTUAL_WIDTH) / 2;
            const midY = (currY + next.y * VIRTUAL_HEIGHT) / 2;
            ctx.quadraticCurveTo(currX, currY, midX, midY);
          } else {
            ctx.lineTo(currX, currY);
          }

          ctx.stroke();
        }
      }

      ctx.restore();
    });
  }, [strokes]);

  // Trigger render on strokes update
  useEffect(() => {
    renderCanvas();
  }, [strokes, renderCanvas]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Virtual dimensions internally always 1920x1080 for 100% precision accuracy
      canvas.width = VIRTUAL_WIDTH;
      canvas.height = VIRTUAL_HEIGHT;

      renderCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  const getNormalizedPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    // Apple Pencil sends realistic e.pressure (0.0 to 1.0)
    // Fallback default for regular touch or mouse is 0.5
    let pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;

    return { x, y, pressure };
  };

  const handlePointerDown = (e) => {
    if (role !== 'host') return;

    // Palm Rejection Check: If enabled, ignore non-pen touches (unless user toggled off)
    if (pencilOnlyMode && e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
      return;
    }

    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);

    const point = getNormalizedPoint(e);
    const currentWidth = tool === 'eraser' ? eraserWidth : baseWidth;

    const newStroke = {
      id: Date.now().toString(),
      tool,
      color,
      width: currentWidth,
      points: [point],
    };

    currentStrokeRef.current = newStroke;

    // Broadcast stroke start
    sendDataToPeer({
      type: 'STROKE_START',
      stroke: newStroke,
    });

    renderCanvas();
  };

  const handlePointerMove = (e) => {
    if (role !== 'host' || !currentStrokeRef.current) return;

    if (pencilOnlyMode && e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
      return;
    }

    e.preventDefault();
    const point = getNormalizedPoint(e);

    currentStrokeRef.current.points.push(point);

    // Stream movement packet
    sendDataToPeer({
      type: 'STROKE_MOVE',
      point,
    });

    renderCanvas();
  };

  const handlePointerUp = (e) => {
    if (role !== 'host' || !currentStrokeRef.current) return;

    e.preventDefault();
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore fallback release error
    }

    const completedStroke = currentStrokeRef.current;
    setStrokes((prev) => [...prev, completedStroke]);
    setRedoStack([]);
    currentStrokeRef.current = null;

    sendDataToPeer({ type: 'STROKE_END' });
    renderCanvas();
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const newStrokes = [...strokes];
    const popped = newStrokes.pop();
    setStrokes(newStrokes);
    setRedoStack((r) => [...r, popped]);

    sendDataToPeer({ type: 'UNDO' });
    renderCanvas();
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const newRedo = [...redoStack];
    const restored = newRedo.pop();
    setRedoStack(newRedo);
    setStrokes((s) => [...s, restored]);

    sendDataToPeer({ type: 'REDO' });
    renderCanvas();
  };

  const handleClear = () => {
    setStrokes([]);
    setRedoStack([]);
    currentStrokeRef.current = null;

    sendDataToPeer({ type: 'CLEAR' });
    renderCanvas();
  };

  const copyShareLink = () => {
    const hostUrl = `${window.location.origin}${window.location.pathname}?role=host&room=${roomId}`;
    navigator.clipboard.writeText(hostUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  if (role === 'select') {
    const hostLink = `${window.location.origin}${window.location.pathname}?role=host&room=${roomId}`;
    const displayLink = `${window.location.origin}${window.location.pathname}?role=display&room=${roomId}`;

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_radial,#27272a_0%,transparent_70%)] opacity-40 pointer-events-none" />

        <div className="max-w-2xl w-full bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                VibeCast Whiteboard
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Ultra-low latency iPad stylus streaming for desktop projectors
              </p>
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Room Code:</span>
              <span className="font-mono text-xl font-bold tracking-wider text-indigo-400 bg-indigo-950/50 px-3 py-1 rounded-lg border border-indigo-800/40">
                {roomId}
              </span>
            </div>
            <button
              onClick={() => setRoomId(generateRoomId())}
              className="text-xs text-zinc-400 hover:text-white underline transition"
            >
              Generate New
            </button>
          </div>

          <p className="text-sm font-medium text-zinc-300 mb-4">Choose this device's role:</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* iPad Input Card */}
            <button
              onClick={() => {
                setRole('host');
                window.history.pushState({}, '', `?role=host&room=${roomId}`);
              }}
              className="group p-6 bg-zinc-800/40 hover:bg-indigo-950/30 border border-zinc-700/50 hover:border-indigo-500/50 rounded-2xl text-left transition duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition duration-200">
                  <Tablet className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">iPad / Stylus (Host)</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Open this on your iPad. Enables Apple Pencil pressure sensitivity, palm rejection, and full control toolbar.
                </p>
              </div>
              <div className="mt-6 flex items-center text-xs font-semibold text-indigo-400">
                Launch Controller &rarr;
              </div>
            </button>

            {/* Desktop / Projector Card */}
            <button
              onClick={() => {
                setRole('display');
                window.history.pushState({}, '', `?role=display&room=${roomId}`);
              }}
              className="group p-6 bg-zinc-800/40 hover:bg-emerald-950/30 border border-zinc-700/50 hover:border-emerald-500/50 rounded-2xl text-left transition duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 bg-emerald-600/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition duration-200">
                  <Tv className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Desktop / Projector</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Open this on your desktop connected to the projector. Displays clean full-screen 16:9 feed & instant QR Code.
                </p>
              </div>
              <div className="mt-6 flex items-center text-xs font-semibold text-emerald-400">
                Launch Presentation &rarr;
              </div>
            </button>
          </div>

          <div className="text-center text-xs text-zinc-500">
            Tip: Bookmark the Display URL on your desktop, then scan the on-screen QR code with your iPad camera to pair instantly.
          </div>
        </div>
      </div>
    );
  }

  const hostUrl = `${window.location.origin}${window.location.pathname}?role=host&room=${roomId}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between select-none overflow-hidden font-sans">
      {}
      <header className="h-14 px-4 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between backdrop-blur-md z-30">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setRole('select');
              window.history.pushState({}, '', window.location.pathname);
            }}
            className="flex items-center space-x-2 text-zinc-400 hover:text-white transition text-xs font-medium bg-zinc-800 px-2.5 py-1.5 rounded-lg"
          >
            &larr; Switch Role
          </button>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center space-x-2">
            <span className="text-xs text-zinc-400">Role:</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              role === 'host' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {role === 'host' ? 'iPad Input (Host)' : 'Desktop Projector'}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-2">
            <span className="text-xs text-zinc-500">Room:</span>
            <span className="font-mono text-xs text-zinc-300 font-bold bg-zinc-800/80 px-2 py-0.5 rounded">
              {roomId}
            </span>
          </div>
        </div>

        {/* Connection Status Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">
            {peerStatus === 'connected' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium hidden md:inline">Connected</span>
              </>
            ) : peerStatus === 'connecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-amber-400 font-medium hidden md:inline">Waiting for peer...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs text-rose-400 font-medium hidden md:inline">Disconnected</span>
              </>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 rounded-lg transition"
            title="Toggle Fullscreen"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </header>

      {}
      <main className="flex-1 relative flex items-center justify-center p-2 sm:p-4 bg-zinc-950 overflow-hidden" ref={containerRef}>
        <div className="relative w-full h-full max-w-[1920px] max-h-[1080px] aspect-video flex items-center justify-center shadow-2xl rounded-2xl overflow-hidden border border-zinc-800/80 bg-zinc-900">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`w-full h-full touch-none ${role === 'host' ? 'cursor-crosshair' : 'cursor-default'}`}
          />

          {/* Desktop Overlay: QR Code for Host pairing when disconnected or waiting */}
          {role === 'display' && peerStatus !== 'connected' && (
            <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-fade-in">
              <div className="max-w-md w-full flex flex-col items-center">
                <div className="mb-4 p-3 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">
                  <QrCode className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-1">Scan to Connect iPad</h2>
                <p className="text-xs text-zinc-400 mb-6">
                  Point your iPad camera at this QR code to launch the stylus whiteboard controller.
                </p>

                <QuickQRCode value={hostUrl} size={190} />

                <div className="mt-6 w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                  <div className="text-left overflow-hidden mr-2">
                    <p className="text-[10px] text-zinc-500 uppercase font-semibold">Direct iPad Link</p>
                    <p className="text-xs text-zinc-300 truncate font-mono">{hostUrl}</p>
                  </div>
                  <button
                    onClick={copyShareLink}
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shrink-0 flex items-center space-x-1 text-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-500 mt-4 flex items-center justify-center space-x-1">
                  <span>Status:</span>
                  <span className="text-amber-400 font-medium">{connectionLog}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {}
      {role === 'host' && (
        <footer className="relative z-30 p-3 bg-zinc-900/90 border-t border-zinc-800 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
          {/* Tool Switcher */}
          <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setTool('pen')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                tool === 'pen' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Pen className="w-4 h-4" />
              <span>Pen</span>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                tool === 'eraser' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Eraser className="w-4 h-4" />
              <span>Eraser</span>
            </button>
          </div>

          {/* Color Palette (Pen mode) or Eraser Size (Eraser mode) */}
          {tool === 'pen' ? (
            <div className="flex items-center space-x-2 overflow-x-auto py-1">
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  className={`w-7 h-7 rounded-full border-2 transition transform active:scale-90 ${
                    color === c.hex ? 'border-indigo-400 scale-110 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center space-x-3 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
              <span className="text-xs text-zinc-400 font-medium">Eraser Size:</span>
              <input
                type="range"
                min="10"
                max="80"
                value={eraserWidth}
                onChange={(e) => setEraserWidth(Number(e.target.value))}
                className="w-24 accent-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-mono text-zinc-300 w-6">{eraserWidth}px</span>
            </div>
          )}

          {/* Stroke Width Selector */}
          {tool === 'pen' && (
            <div className="hidden md:flex items-center space-x-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
              <span className="text-xs text-zinc-400 font-medium">Thickness:</span>
              <div className="flex items-center space-x-1">
                {[2, 4, 8, 14].map((w) => (
                  <button
                    key={w}
                    onClick={() => setBaseWidth(w)}
                    className={`w-6 h-6 rounded-md flex items-center justify-center transition ${
                      baseWidth === w ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <div
                      className="rounded-full bg-current"
                      style={{ width: Math.max(3, w * 0.8), height: Math.max(3, w * 0.8) }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Palm Rejection Toggle */}
          <button
            onClick={() => setPencilOnlyMode(!pencilOnlyMode)}
            className={`hidden sm:flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition ${
              pencilOnlyMode
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Palm Rejection: Accepts Apple Pencil strokes only"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Pencil Only: {pencilOnlyMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* Undo, Redo, Clear Controls */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 rounded-xl text-zinc-300 transition"
              title="Undo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 rounded-xl text-zinc-300 transition"
              title="Redo"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-zinc-800 mx-1" />

            <button
              onClick={handleClear}
              className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/50 rounded-xl transition flex items-center space-x-1 text-xs"
              title="Clear Canvas"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
