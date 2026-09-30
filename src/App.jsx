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
  Download,
  Square,
  Circle,
  Minus,
  Pointer,
  ChevronLeft,
  ChevronRight,
  Plus
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
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
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
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'rectangle' | 'circle' | 'line' | 'laser'
  const [color, setColor] = useState('#3b82f6');
  const [baseWidth, setBaseWidth] = useState(4);
  const [palmRejection, setPalmRejection] = useState(false);

  // Multi-Page State
  const [pages, setPages] = useState([[]]); // Array of path arrays
  const [currentPage, setCurrentPage] = useState(0);

  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Refs
  const canvasRef = useRef(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const currentPathRef = useRef(null);
  const isDrawingRef = useRef(false);
  const laserPathsRef = useRef([]); // Temporary laser paths
  const pinchStartRef = useRef(null);

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

  // Laser Fade-out Animation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const activeLasers = laserPathsRef.current.filter((lp) => now - lp.timestamp < 2000);
      if (activeLasers.length !== laserPathsRef.current.length) {
        laserPathsRef.current = activeLasers;
        redrawCanvas();
      }
    }, 50);

    return () => clearInterval(interval);
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

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);

    const renderPath = (path) => {
      if (!path || !path.points || path.points.length === 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (path.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else if (path.tool === 'laser') {
        ctx.globalCompositeOperation = 'source-over';
        const age = Date.now() - (path.timestamp || Date.now());
        const opacity = Math.max(0, 1 - age / 2000);
        ctx.strokeStyle = `rgba(239, 68, 68, ${opacity})`;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = path.color;
      }

      const p1 = path.points[0];
      const startX = p1.x * width;
      const startY = p1.y * height;

      if (['rectangle', 'circle', 'line'].includes(path.tool)) {
        const p2 = path.points[path.points.length - 1];
        const endX = p2.x * width;
        const endY = p2.y * height;
        ctx.lineWidth = path.width;

        if (path.tool === 'rectangle') {
          ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        } else if (path.tool === 'circle') {
          const rx = Math.abs(endX - startX) / 2;
          const ry = Math.abs(endY - startY) / 2;
          const cx = Math.min(startX, endX) + rx;
          const cy = Math.min(startY, endY) + ry;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (path.tool === 'line') {
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      } else {
        // Freehand Pen / Eraser / Laser
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
      }
      ctx.restore();
    };

    // Render Current Page Permanent Paths
    const activePagePaths = pages[currentPage] || [];
    activePagePaths.forEach(renderPath);

    // Render Active In-Progress Path
    if (currentPathRef.current) {
      renderPath(currentPathRef.current);
    }

    // Render Fading Laser Pointer Paths
    laserPathsRef.current.forEach(renderPath);

    ctx.restore();
  }, [pages, currentPage, scale, pan]);

  // Handle Resize & DPI Scaling
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

  // PeerJS Connection Setup
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
        if (['rectangle', 'circle', 'line'].includes(currentPathRef.current.tool)) {
          currentPathRef.current.points[1] = data.point;
        } else {
          currentPathRef.current.points.push(data.point);
        }
        redrawCanvas();
      }
    } else if (data.type === 'DRAW_END') {
      if (currentPathRef.current) {
        if (currentPathRef.current.tool === 'laser') {
          laserPathsRef.current.push({ ...currentPathRef.current, timestamp: Date.now() });
        } else {
          const completedPath = { ...currentPathRef.current };
          setPages((prevPages) => {
            const newPages = [...prevPages];
            const targetIdx = data.pageIndex !== undefined ? data.pageIndex : currentPage;
            newPages[targetIdx] = [...(newPages[targetIdx] || []), completedPath];
            return newPages;
          });
        }
        currentPathRef.current = null;
        redrawCanvas();
      }
    } else if (data.type === 'CLEAR') {
      setPages((prev) => {
        const copy = [...prev];
        copy[data.pageIndex] = [];
        return copy;
      });
      redrawCanvas();
    } else if (data.type === 'UNDO') {
      setPages((prev) => {
        const copy = [...prev];
        if (copy[data.pageIndex]) copy[data.pageIndex].pop();
        return copy;
      });
      redrawCanvas();
    } else if (data.type === 'PAGE_CHANGE') {
      setCurrentPage(data.pageIndex);
    } else if (data.type === 'PAGE_ADD') {
      setPages((prev) => [...prev, []]);
      setCurrentPage(data.newPageIndex);
    } else if (data.type === 'PAGE_DELETE') {
      setPages((prev) => prev.filter((_, idx) => idx !== data.deleteIndex));
      setCurrentPage(data.newPageIndex);
    }
  };

  // Coordinates Mapping
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const transformedX = (rawX - pan.x) / scale;
    const transformedY = (rawY - pan.y) / scale;

    const normX = Math.max(0, Math.min(1, transformedX / rect.width));
    const normY = Math.max(0, Math.min(1, transformedY / rect.height));

    return { x: normX, y: normY };
  };

  // Pinch Zoom Gesture
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      isDrawingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartRef.current = { dist, scale };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const factor = dist / pinchStartRef.current.dist;
      const newScale = Math.max(0.5, Math.min(3, pinchStartRef.current.scale * factor));
      setScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
  };

  // Pointer Handlers
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

    if (['rectangle', 'circle', 'line'].includes(tool)) {
      newPath.points.push({ x: normX, y: normY, pressure });
    }

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
      if (['rectangle', 'circle', 'line'].includes(tool)) {
        currentPathRef.current.points[1] = point;
      } else {
        currentPathRef.current.points.push(point);
      }
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
      const finishedPath = { ...currentPathRef.current };

      if (finishedPath.tool === 'laser') {
        laserPathsRef.current.push({ ...finishedPath, timestamp: Date.now() });
      } else {
        // Save permanently to the host page state
        setPages((prevPages) => {
          const newPages = [...prevPages];
          newPages[currentPage] = [...(newPages[currentPage] || []), finishedPath];
          return newPages;
        });
      }

      broadcastData({ type: 'DRAW_END', pageIndex: currentPage });
      currentPathRef.current = null;
      redrawCanvas();
    }
  };

  // Actions
  const handleClear = () => {
    setPages((prev) => {
      const copy = [...prev];
      copy[currentPage] = [];
      return copy;
    });
    redrawCanvas();
    broadcastData({ type: 'CLEAR', pageIndex: currentPage });
  };

  const handleUndo = () => {
    setPages((prev) => {
      const copy = [...prev];
      if (copy[currentPage]) copy[currentPage].pop();
      return copy;
    });
    redrawCanvas();
    broadcastData({ type: 'UNDO', pageIndex: currentPage });
  };

  const handlePageChange = (newIdx) => {
    if (newIdx >= 0 && newIdx < pages.length) {
      setCurrentPage(newIdx);
      broadcastData({ type: 'PAGE_CHANGE', pageIndex: newIdx });
    }
  };

  const handleAddPage = () => {
    const newIdx = pages.length;
    setPages((prev) => [...prev, []]);
    setCurrentPage(newIdx);
    broadcastData({ type: 'PAGE_ADD', newPageIndex: newIdx });
  };

  const handleDeletePage = () => {
    if (pages.length <= 1) return;
    const newIdx = Math.max(0, currentPage - 1);
    setPages((prev) => prev.filter((_, idx) => idx !== currentPage));
    setCurrentPage(newIdx);
    broadcastData({ type: 'PAGE_DELETE', deleteIndex: currentPage, newPageIndex: newIdx });
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `whiteboard-page-${currentPage + 1}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-blue-500/30">
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
              Multi-page vector drawing and presentation tool designed for iPads and desktop displays.
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
        <div className="flex items-center space-x-3 pointer-events-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 px-4 py-2 rounded-2xl shadow-xl">
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

        {/* Multi-Page Controller */}
        <div className="pointer-events-auto flex items-center space-x-2 bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 px-3 py-1.5 rounded-2xl shadow-xl">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 0}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono px-2 text-slate-300 font-semibold">
            Page {currentPage + 1} / {pages.length}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === pages.length - 1}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {role === 'host' && (
            <>
              <div className="h-4 w-px bg-slate-800" />
              <button
                onClick={handleAddPage}
                className="p-1.5 text-blue-400 hover:text-blue-300 transition"
                title="Add New Page"
              >
                <Plus className="w-4 h-4" />
              </button>
              {pages.length > 1 && (
                <button
                  onClick={handleDeletePage}
                  className="p-1.5 text-rose-400 hover:text-rose-300 transition"
                  title="Delete Current Page"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Network & Export Controls */}
        <div className="flex items-center space-x-2 pointer-events-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 px-3 py-1.5 rounded-2xl shadow-xl">
          <button
            onClick={handleExportPNG}
            className="p-2 text-slate-300 hover:text-white transition flex items-center space-x-1.5 text-xs font-medium"
            title="Export Page as PNG"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

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
            <span className="capitalize hidden sm:inline">{peerStatus}</span>
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

      {/* Main Surface */}
      <main className="flex-1 relative flex items-center justify-center p-2 sm:p-6 bg-[#07090e]">
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

        <div className="relative w-full max-w-[1920px] aspect-video bg-slate-950/90 rounded-2xl border border-slate-800/80 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="w-full h-full cursor-crosshair touch-none select-none"
          />

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

      {/* Floating Toolbar (Host Only) */}
      {role === 'host' && (
        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-3 bg-slate-900/80 backdrop-blur-2xl border border-slate-800/80 p-2 rounded-2xl shadow-2xl max-w-[95vw] overflow-x-auto">
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 space-x-1">
            <button
              onClick={() => setTool('pen')}
              className={`p-2 rounded-lg text-xs font-semibold transition ${
                tool === 'pen' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Pen Tool"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-lg text-xs font-semibold transition ${
                tool === 'eraser' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Eraser Tool"
            >
              <Eraser className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('laser')}
              className={`p-2 rounded-lg text-xs font-semibold transition ${
                tool === 'laser' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Laser Pointer (Fades in 2s)"
            >
              <Pointer className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800 my-auto" />

            <button
              onClick={() => setTool('rectangle')}
              className={`p-2 rounded-lg text-xs font-semibold transition ${
                tool === 'rectangle' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Rectangle Tool"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('circle')}
              className={`p-2 rounded-lg text-xs font-semibold transition ${
                tool === 'circle' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Circle / Oval Tool"
            >
              <Circle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('line')}
              className={`p-2 rounded-lg text-xs font-semibold transition ${
                tool === 'line' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Straight Line Tool"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>

          {['pen', 'rectangle', 'circle', 'line'].includes(tool) && (
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

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setPalmRejection(!palmRejection)}
              className={`p-2 rounded-xl border text-xs font-medium transition ${
                palmRejection
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950/80 text-slate-400 border-slate-800/80'
              }`}
              title="Palm Rejection"
            >
              {palmRejection ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
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
              title="Clear Current Page"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
