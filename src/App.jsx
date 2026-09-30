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
  RefreshCw,
  Sparkles,
  Share2,
  Sliders,
  Maximize2
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

const COLOR_PALETTE = [
  '#3b82f6', // Electric Blue
  '#ef4444', // Crimson Red
  '#10b981', // Emerald Green
  '#f59e0b', // Amber
  '#a855f7', // Purple
  '#ffffff', // White
];

export default function App() {
  const [role, setRole] = useState(null); // 'host' | 'display' | null
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [peerStatus, setPeerStatus] = useState('disconnected');
  
  // Tools & Canvas State
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#3b82f6');
  const [baseWidth, setBaseWidth] = useState(4);
  const [palmRejection, setPalmRejection] = useState(false);
  
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

  // Redraw Canvas Handler
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

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
        const lineWidth = pt.pressure ? path.width * (0.3 + pt.pressure * 1.5) : path.width;

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

  // Resize & Retina Scaling
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

  // PeerJS Signaling Connection
  useEffect(() => {
    if (!role || !roomId) return;

    setPeerStatus('connecting');

    if (role === 'display') {
      const peer = new Peer(`wb-${roomId}`, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => setPeerStatus('connecting'));
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

      peer.on('open', () => connectToDisplay(peer, roomId));
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

  const connectToDisplay = (peer, roomCode, retryCount = 0) => {
    setPeerStatus('connecting');
    const conn = peer.connect(`wb-${roomCode}`, { reliable: true });
    connRef.current = conn;

    conn.on('open', () => setPeerStatus('connected'));
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

  // Precise Coordinate Mapping Calculation
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    return { x: normX, y: normY };
  };

  // Pointer Event Handlers
  const handlePointerDown = (e) => {
    if (role !== 'host') return;
    if (e.cancelable) e.preventDefault();
    if (palmRejection && e.pointerType === 'touch') return;

    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    const { x: normX, y: normY } = getCanvasCoordinates(e);
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;

    const newPath = {
      id: Date.now(),
      tool,
      color,
      width: tool === 'eraser' ? baseWidth * 6 : baseWidth,
      points: [{ x: normX, y: normY, pressure }]
    };

    currentPathRef.current = newPath;
    redrawCanvas();
    broadcastData({ type: 'DRAW_START', path: newPath });
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || role !== 'host') return;
    if (e.cancelable) e.preventDefault();

    const { x: normX, y: normY } = getCanvasCoordinates(e);
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
      } catch (err) {}
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

  // Modern Landing / Role Selection Screen
  if (!role) {
    return (
      <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-blue-500/30">
        {/* Glow Background Gradient Effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-[128px]" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[128px]" />
        </div>

        <div className="max-w-md w-full bg-slate-900/40 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl space-y-8 relative z-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Realtime Canvas Sync</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Board
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Zero-latency vector ink streaming from mobile devices to desktop presentation surfaces.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => {
                setRole('display');
                window.history.pushState({}, '', `?role=display&room=${roomId}`);
              }}
              className="w-full group relative overflow-hidden flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-blue-500/50 rounded-2xl transition duration-200 shadow-sm"
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition duration-200">
                  <Monitor className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-white group-hover:text-blue-300 transition">Display Surface</div>
                  <div className="text-xs text-slate-400">Desktop / Projector Viewer</div>
                </div>
              </div>
              <span className="text-xs font-mono bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-300">
                {roomId}
              </span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800/80"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase tracking-widest font-semibold">or join session</span>
              <div className="flex-grow border-t border-slate-800/80"></div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="ENTER 6-DIGIT ROOM CODE"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full bg-slate-950/80 border border-slate-800/80 rounded-2xl px-4 py-3.5 text-center text-lg font-mono tracking-[0.25em] text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition placeholder:tracking-normal placeholder:text-slate-600 uppercase"
                maxLength={6}
              />
              <button
                disabled={!inputRoomId || inputRoomId.length < 6}
                onClick={() => {
                  setRoomId(inputRoomId);
                  setRole('host');
                  window.history.pushState({}, '', `?role=host&room=${inputRoomId}`);
                }}
                className="w-full flex items-center justify-center space-x-2.5 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:hover:from-blue-600 text-white rounded-2xl font-semibold transition duration-200 shadow-lg shadow-blue-600/20"
              >
                <Tablet className="w-5 h-5" />
                <span>Join as Controller</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}?role=host&room=${roomId}`;

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between select-none overflow-hidden touch-none relative">
      
      {/* Floating Header */}
      <header className="fixed top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center space-x-3 pointer-events-auto bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 px-4 py-2 rounded-2xl shadow-xl">
          <span className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
            BOARD
          </span>
          <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
            {role}
          </span>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center space-x-1.5 text-xs font-mono text-slate-400">
            <span className="text-slate-600">ID:</span>
            <span className="text-blue-400 font-bold tracking-wider">{roomId}</span>
          </div>
        </div>

        {/* Peer Status Badge */}
        <div className="flex items-center space-x-2 pointer-events-auto bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 px-3.5 py-2 rounded-2xl shadow-xl">
          <div className={`flex items-center space-x-2 text-xs font-medium ${
            peerStatus === 'connected' 
              ? 'text-emerald-400' 
              : peerStatus === 'connecting'
              ? 'text-amber-400 animate-pulse'
              : 'text-rose-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              peerStatus === 'connected' ? 'bg-emerald-400' : peerStatus === 'connecting' ? 'bg-amber-400' : 'bg-rose-400'
            }`} />
            <span className="capitalize">{peerStatus}</span>
          </div>

          {role === 'host' && peerStatus === 'disconnected' && (
            <button 
              onClick={() => peerRef.current && connectToDisplay(peerRef.current, roomId)}
              className="ml-1 p-1 text-slate-400 hover:text-white transition"
              title="Retry Connection"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Drawing Surface */}
      <main className="flex-1 relative flex items-center justify-center p-2 sm:p-6 bg-[#07090e]">
        {/* Subtle Dots Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

        {/* 16:9 Canvas Container */}
        <div className="relative w-full max-w-[1920px] aspect-video bg-slate-950/90 rounded-2xl border border-slate-800/80 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="w-full h-full cursor-crosshair touch-none select-none"
          />

          {/* Display Mode Waiting Screen */}
          {role === 'display' && peerStatus !== 'connected' && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center space-y-6 z-10 p-6 text-center">
              <div className="space-y-2 max-w-sm">
                <h2 className="text-2xl font-bold tracking-tight text-white">Connect Controller</h2>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Scan this code using an iPad or iPhone camera to initiate real-time drawing mode.
                </p>
              </div>

              <div className="p-5 bg-white rounded-3xl shadow-2xl border-4 border-slate-800/80">
                <QRCodeSVG value={joinUrl} size={190} />
              </div>

              <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800">
                <span>URL:</span>
                <span className="text-blue-400">{joinUrl}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Controller Floating Bar (Host Role Only) */}
      {role === 'host' && (
        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-3 bg-slate-900/80 backdrop-blur-2xl border border-slate-800/80 p-2 rounded-2xl shadow-2xl">
          {/* Tool Switcher */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setTool('pen')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition duration-150 ${
                tool === 'pen' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Pen</span>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition duration-150 ${
                tool === 'eraser' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Eraser</span>
            </button>
          </div>

          {/* Pen Color Palette */}
          {tool === 'pen' && (
            <div className="flex items-center space-x-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-slate-950 ring-white scale-110' : 'opacity-70'
                  }`}
                />
              ))}
            </div>
          )}

          <div className="h-5 w-px bg-slate-800" />

          {/* Actions & Palm Guard */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPalmRejection(!palmRejection)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition ${
                palmRejection
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950/80 text-slate-400 border-slate-800/80'
              }`}
              title="Disable touch input when Apple Pencil is in use"
            >
              {palmRejection ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleUndo}
              className="p-2 text-slate-400 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800/80 rounded-xl transition"
              title="Undo Stroke"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              className="p-2 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition"
              title="Clear Whiteboard"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
