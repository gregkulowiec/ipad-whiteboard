import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Pencil, 
  Eraser, 
  RotateCcw, 
  Trash2, 
  Wifi, 
  WifiOff, 
  Monitor, 
  Tablet, 
  ShieldAlert, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import Peer from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
    ]
  }
};

export default function App() {
  const [role, setRole] = useState(null); // 'host' (iPad) | 'display' (Desktop) | null
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [peerStatus, setPeerStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  
  // Canvas & Drawing Tools State
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#2563eb');
  const [baseWidth, setBaseWidth] = useState(4);
  const [palmRejection, setPalmRejection] = useState(false); // Default false so touch works out-of-the-box
  
  // Refs
  const canvasRef = useRef(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const pathsRef = useRef([]);
  const currentPathRef = useRef(null);
  const isDrawingRef = useRef(false);

  // Read URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role');
    const urlRoom = params.get('room');

    if (urlRoom) {
      setRoomId(urlRoom.toUpperCase());
    } else {
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomId(newRoomId);
    }

    if (urlRole === 'host' || urlRole === 'display') {
      setRole(urlRole);
    }
  }, []);

  // Redraw Canvas Handler with global composite eraser fix
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Reset transform matrix before clear to handle retina scaling cleanups
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const renderPath = (path) => {
      if (!path || !path.points || path.points.length === 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (path.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = path.color;
      }

      for (let i = 0; i < path.points.length; i++) {
        const pt = path.points[i];
        const x = pt.x * width;
        const y = pt.y * height;
        const lineWidth = pt.pressure ? path.width * (0.3 + pt.pressure * 1.4) : path.width;

        ctx.lineWidth = lineWidth;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevPt = path.points[i - 1];
          const prevX = prevPt.x * width;
          const prevY = prevPt.y * height;
          const midX = (prevX + x) / 2;
          const midY = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    pathsRef.current.forEach(renderPath);
    if (currentPathRef.current) {
      renderPath(currentPathRef.current);
    }
  }, []);

  // Handle Resize & High-DPI (Retina) Canvas Scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [role, redrawCanvas]);

  // PeerJS Signaling Connection & Handshake logic
  useEffect(() => {
    if (!role || !roomId) return;

    setPeerStatus('connecting');

    if (role === 'display') {
      const peer = new Peer(`wb-${roomId}`, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        setPeerStatus('connecting');
      });

      peer.on('connection', (conn) => {
        connRef.current = conn;
        setPeerStatus('connected');

        conn.on('data', (data) => handleIncomingData(data));
        conn.on('close', () => setPeerStatus('disconnected'));
        conn.on('error', () => setPeerStatus('disconnected'));
      });

      peer.on('error', (err) => {
        console.error('PeerJS Display Error:', err);
        setPeerStatus('disconnected');
      });

    } else if (role === 'host') {
      const peer = new Peer(PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        connectToDisplay(peer, roomId);
      });

      peer.on('error', (err) => {
        console.error('PeerJS Host Error:', err);
        setPeerStatus('disconnected');
      });
    }

    return () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [role, roomId]);

  // Connect to Display Peer with retry loop for host
  const connectToDisplay = (peer, roomCode, retryCount = 0) => {
    setPeerStatus('connecting');
    const conn = peer.connect(`wb-${roomCode}`, { reliable: true });
    connRef.current = conn;

    conn.on('open', () => {
      setPeerStatus('connected');
    });

    conn.on('data', (data) => handleIncomingData(data));
    conn.on('close', () => setPeerStatus('disconnected'));
    
    conn.on('error', () => {
      setPeerStatus('disconnected');
      if (retryCount < 5) {
        setTimeout(() => connectToDisplay(peer, roomCode, retryCount + 1), 1500);
      }
    });
  };

  const broadcastData = (data) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send(data);
    }
  };

  const handleIncomingData = (data) => {
    if (data.type === 'DRAW_START') {
      currentPathRef.current = data.path;
    } else if (data.type === 'DRAW_MOVE') {
      if (currentPathRef.current) {
        currentPathRef.current.points.push(data.point);
        redrawCanvas();
      }
    } else if (data.type === 'DRAW_END') {
      if (currentPathRef.current) {
        pathsRef.current.push(currentPathRef.current);
        currentPathRef.current = null;
        redrawCanvas();
      }
    } else if (data.type === 'CLEAR') {
      pathsRef.current = [];
      currentPathRef.current = null;
      redrawCanvas();
    } else if (data.type === 'UNDO') {
      pathsRef.current.pop();
      redrawCanvas();
    }
  };

  // Pointer Events (Touch, Apple Pencil, Mouse Handling)
  const handlePointerDown = (e) => {
    if (role !== 'host') return;
    if (e.cancelable) e.preventDefault();

    // Palm Rejection logic: when enabled, ignore single finger touches if Apple Pencil is active
    if (palmRejection && e.pointerType === 'touch') return;

    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Fallback for custom webviews
    }

    const rect = canvas.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;

    const newPath = {
      id: Date.now(),
      tool,
      color,
      width: tool === 'eraser' ? baseWidth * 5 : baseWidth,
      points: [{ x: normX, y: normY, pressure }]
    };

    currentPathRef.current = newPath;
    redrawCanvas();
    broadcastData({ type: 'DRAW_START', path: newPath });
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || role !== 'host') return;
    if (e.cancelable) e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;

    const point = { x: normX, y: normY, pressure };

    if (currentPathRef.current) {
      currentPathRef.current.points.push(point);
      redrawCanvas();
      broadcastData({ type: 'DRAW_MOVE', point });
    }
  };

  const handlePointerUp = (e) => {
    if (!isDrawingRef.current || role !== 'host') return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore capture release errors
      }
    }

    if (currentPathRef.current) {
      pathsRef.current.push(currentPathRef.current);
      currentPathRef.current = null;
      redrawCanvas();
      broadcastData({ type: 'DRAW_END' });
    }
  };

  const handleClear = () => {
    pathsRef.current = [];
    currentPathRef.current = null;
    redrawCanvas();
    broadcastData({ type: 'CLEAR' });
  };

  const handleUndo = () => {
    pathsRef.current.pop();
    redrawCanvas();
    broadcastData({ type: 'UNDO' });
  };

  // Role Selection Screen
  if (!role) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              iPad Whiteboard
            </h1>
            <p className="text-slate-400 text-sm">
              Stream live drawing from your iPad or iPhone to a desktop display in real time.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            <button
              onClick={() => {
                setRole('display');
                window.history.pushState({}, '', `?role=display&room=${roomId}`);
              }}
              className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition">
                  <Monitor className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-white">Display Mode</div>
                  <div className="text-xs text-slate-400">Desktop / Projector Viewer</div>
                </div>
              </div>
              <span className="text-xs font-mono bg-slate-900 px-2 py-1 rounded border border-slate-700 text-slate-300">
                {roomId}
              </span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase tracking-wider">or join room</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter 6-digit Room Code"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-blue-500 transition placeholder:text-slate-600 uppercase"
                maxLength={6}
              />
              <button
                disabled={!inputRoomId || inputRoomId.length < 6}
                onClick={() => {
                  setRoomId(inputRoomId);
                  setRole('host');
                  window.history.pushState({}, '', `?role=host&room=${inputRoomId}`);
                }}
                className="w-full flex items-center justify-center space-x-2 p-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-medium transition shadow-lg shadow-blue-500/20"
              >
                <Tablet className="w-5 h-5" />
                <span>Join as iPad Controller</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}?role=host&room=${roomId}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between select-none overflow-hidden touch-none">
      {/* Header Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur z-20">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Board
            </span>
            <span className="text-xs uppercase tracking-widest font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {role}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-500">ROOM:</span>
            <span className="text-blue-400 font-bold">{roomId}</span>
          </div>
        </div>

        {/* Peer Network Connection Status */}
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 text-xs px-3 py-1.5 rounded-full border ${
            peerStatus === 'connected' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : peerStatus === 'connecting'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {peerStatus === 'connected' ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Connected</span>
              </>
            ) : peerStatus === 'connecting' ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Disconnected</span>
              </>
            )}
          </div>

          {role === 'host' && peerStatus === 'disconnected' && (
            <button 
              onClick={() => peerRef.current && connectToDisplay(peerRef.current, roomId)}
              className="p-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 transition"
              title="Retry Connection"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Viewport */}
      <main className="flex-1 relative flex items-center justify-center p-4 bg-slate-950">
        <div className="relative w-full max-w-[1920px] aspect-video bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="w-full h-full cursor-crosshair touch-none select-none"
          />

          {role === 'display' && peerStatus !== 'connected' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center space-y-6 z-10 p-6 text-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Scan to Connect iPad</h2>
                <p className="text-slate-400 text-sm max-w-sm">
                  Point your iPad or iPhone camera at this QR code to start drawing instantly.
                </p>
              </div>

              <div className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-slate-800">
                <QRCodeSVG value={joinUrl} size={200} />
              </div>

              <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono">
                <span>Direct Link:</span>
                <span className="text-blue-400 underline">{joinUrl}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* iPad Drawing Controls (Host Role Only) */}
      {role === 'host' && (
        <footer className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/80 backdrop-blur z-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setTool('pen')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tool === 'pen' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Pencil className="w-4 h-4" />
                <span>Pen</span>
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tool === 'eraser' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eraser className="w-4 h-4" />
                <span>Eraser</span>
              </button>
            </div>

            {tool === 'pen' && (
              <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                {['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#ffffff'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full transition transform hover:scale-110 ${
                      color === c ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110' : 'opacity-80'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setPalmRejection(!palmRejection)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl border text-xs font-medium transition ${
                palmRejection
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              {palmRejection ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              <span>Palm Rejection</span>
            </button>

            <div className="h-6 w-px bg-slate-800" />

            <button
              onClick={handleUndo}
              className="p-2.5 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition"
              title="Undo Last Stroke"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={handleClear}
              className="p-2.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition"
              title="Clear Canvas"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
