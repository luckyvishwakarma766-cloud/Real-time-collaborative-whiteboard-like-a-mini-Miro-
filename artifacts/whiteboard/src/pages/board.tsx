import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetRoom,
  useGetRoomElements,
  getGetRoomQueryKey,
  getGetRoomElementsQueryKey,
  useClearRoom,
  CanvasElementType,
} from "@workspace/api-client-react";
import { useBoardSocket } from "@/hooks/use-board-socket";
import {
  Loader2, AlertCircle, Share2, MousePointer2, Square, Circle,
  MoveRight, Type, PenLine, Eraser, Trash2, ZoomIn, ZoomOut, Undo2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { useQueryClient } from "@tanstack/react-query";

type Tool = "select" | "pen" | "rect" | "ellipse" | "arrow" | "text" | "eraser";

interface Point { x: number; y: number; }
interface RenderedElement {
  id: string;
  roomId: string;
  type: CanvasElementType;
  data: string;
  createdAt: string;
}

const USER_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#06b6d4","#f97316"];

function hashColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return USER_COLORS[Math.abs(h) % USER_COLORS.length];
}

export function Board() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();
  const [userName] = useState(() => {
    const stored = sessionStorage.getItem("bf-username");
    if (stored) return stored;
    const adjectives = ["swift","quiet","bold","bright","calm"];
    const nouns = ["fox","owl","pine","star","wave"];
    const name = adjectives[Math.floor(Math.random() * 5)] + "-" + nouns[Math.floor(Math.random() * 5)];
    sessionStorage.setItem("bf-username", name);
    return name;
  });

  const { data: room, isLoading: isLoadingRoom, error: roomError } = useGetRoom(roomId!, {
    query: { enabled: !!roomId, queryKey: getGetRoomQueryKey(roomId!) }
  });

  const { data: initialElements, isLoading: isLoadingElements } = useGetRoomElements(roomId!, {
    query: { enabled: !!roomId, queryKey: getGetRoomElementsQueryKey(roomId!) }
  });

  if (roomError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4 bg-background">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Room not found or expired</p>
        <Button onClick={() => setLocation("/")}>Back to Home</Button>
      </div>
    );
  }

  if (isLoadingRoom || isLoadingElements) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f8f8fa]">
      <CanvasApp
        roomId={roomId!}
        userName={userName}
        initialElements={(initialElements || []) as RenderedElement[]}
        roomName={room?.name || "Board"}
      />
    </div>
  );
}

function CanvasApp({ roomId, userName, initialElements, roomName }: {
  roomId: string;
  userName: string;
  initialElements: RenderedElement[];
  roomName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queryClient = useQueryClient();

  const { users, elements, cursors, addElement, updateElement, deleteElement, clearBoard, updateCursor } =
    useBoardSocket(roomId, userName, initialElements);

  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#6366f1");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  const isDrawing = useRef(false);
  const startPt = useRef<Point>({ x: 0, y: 0 });
  const currentPath = useRef<Point[]>([]);
  const currentElementId = useRef<string>("");
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const panOrigin = useRef<Point>({ x: 0, y: 0 });

  const toCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const drawElement = useCallback((ctx: CanvasRenderingContext2D, el: RenderedElement) => {
    let data: any;
    try { data = JSON.parse(el.data); } catch { return; }
    ctx.save();
    ctx.strokeStyle = data.color || "#6366f1";
    ctx.lineWidth = (data.strokeWidth || 3);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (el.type === "pen" && data.points?.length > 1) {
      ctx.beginPath();
      ctx.moveTo(data.points[0].x, data.points[0].y);
      for (let i = 1; i < data.points.length; i++) {
        ctx.lineTo(data.points[i].x, data.points[i].y);
      }
      ctx.stroke();
    } else if (el.type === "rect") {
      ctx.strokeRect(data.x, data.y, data.w, data.h);
    } else if (el.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(data.x + data.w / 2, data.y + data.h / 2, Math.abs(data.w / 2), Math.abs(data.h / 2), 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (el.type === "arrow") {
      const { x1, y1, x2, y2 } = data;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const len = 16;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = data.color || "#6366f1";
      ctx.fill();
    } else if (el.type === "text" && data.text) {
      ctx.fillStyle = data.color || "#6366f1";
      ctx.font = `${data.fontSize || 18}px Inter, sans-serif`;
      ctx.fillText(data.text, data.x, data.y);
    }
    ctx.restore();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    const gridSize = 30;
    const startX = Math.floor(-pan.x / zoom / gridSize) * gridSize;
    const startY = Math.floor(-pan.y / zoom / gridSize) * gridSize;
    const endX = startX + canvas.width / zoom + gridSize;
    const endY = startY + canvas.height / zoom + gridSize;
    ctx.strokeStyle = "#e5e5f0";
    ctx.lineWidth = 0.5;
    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
    }

    elements.forEach((el) => drawElement(ctx, el as RenderedElement));

    // Remote cursors
    Object.values(cursors).forEach((c) => {
      const col = hashColor(c.userId);
      ctx.save();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(c.userName, c.x + 8, c.y - 4);
      ctx.restore();
    });

    ctx.restore();
  }, [elements, cursors, pan, zoom, drawElement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
      return;
    }
    if (activeTool === "select") return;
    isDrawing.current = true;
    const pt = toCanvas(e);
    startPt.current = pt;
    currentPath.current = [pt];
    currentElementId.current = uuidv4();
  }, [activeTool, pan, toCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      setPan({
        x: panOrigin.current.x + (e.clientX - panStart.current.x),
        y: panOrigin.current.y + (e.clientY - panStart.current.y),
      });
      return;
    }

    const rect = canvasRef.current!.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - pan.x) / zoom;
    const rawY = (e.clientY - rect.top - pan.y) / zoom;
    updateCursor(rawX, rawY);

    if (!isDrawing.current) return;
    const pt = toCanvas(e);

    if (activeTool === "pen") {
      currentPath.current.push(pt);
      const id = currentElementId.current;
      const data = JSON.stringify({ points: currentPath.current, color, strokeWidth });
      updateElement(id, data);
      redraw();
    } else {
      redraw();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      const sp = startPt.current;
      if (activeTool === "rect") {
        ctx.strokeRect(sp.x, sp.y, pt.x - sp.x, pt.y - sp.y);
      } else if (activeTool === "ellipse") {
        const cx = (sp.x + pt.x) / 2;
        const cy = (sp.y + pt.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(pt.x - sp.x) / 2, Math.abs(pt.y - sp.y) / 2, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === "arrow") {
        const angle = Math.atan2(pt.y - sp.y, pt.x - sp.x);
        const len = 16;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - len * Math.cos(angle - Math.PI / 6), pt.y - len * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(pt.x - len * Math.cos(angle + Math.PI / 6), pt.y - len * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    }
  }, [activeTool, color, strokeWidth, pan, zoom, toCanvas, redraw, updateCursor, updateElement]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const pt = toCanvas(e);
    const sp = startPt.current;
    const id = currentElementId.current;

    let data = "";
    if (activeTool === "pen") {
      data = JSON.stringify({ points: currentPath.current, color, strokeWidth });
    } else if (activeTool === "rect") {
      data = JSON.stringify({ x: sp.x, y: sp.y, w: pt.x - sp.x, h: pt.y - sp.y, color, strokeWidth });
    } else if (activeTool === "ellipse") {
      data = JSON.stringify({ x: sp.x, y: sp.y, w: pt.x - sp.x, h: pt.y - sp.y, color, strokeWidth });
    } else if (activeTool === "arrow") {
      data = JSON.stringify({ x1: sp.x, y1: sp.y, x2: pt.x, y2: pt.y, color, strokeWidth });
    } else if (activeTool === "text") {
      const text = window.prompt("Enter text:");
      if (!text) return;
      data = JSON.stringify({ x: sp.x, y: sp.y, text, color, fontSize: 18 });
    } else {
      return;
    }

    const newEl: RenderedElement = {
      id,
      roomId,
      type: activeTool as CanvasElementType,
      data,
      createdAt: new Date().toISOString(),
    };
    addElement(newEl);
  }, [activeTool, color, strokeWidth, toCanvas, addElement, roomId]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.min(5, Math.max(0.2, z * scaleFactor)));
  }, []);

  const handleClearBoard = () => {
    clearBoard();
    queryClient.invalidateQueries({ queryKey: getGetRoomElementsQueryKey(roomId) });
    toast.success("Board cleared");
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  const TOOLS: { tool: Tool; icon: React.ReactNode; title: string }[] = [
    { tool: "select", icon: <MousePointer2 className="h-4 w-4" />, title: "Select" },
    { tool: "pen", icon: <PenLine className="h-4 w-4" />, title: "Pen" },
    { tool: "rect", icon: <Square className="h-4 w-4" />, title: "Rectangle" },
    { tool: "ellipse", icon: <Circle className="h-4 w-4" />, title: "Ellipse" },
    { tool: "arrow", icon: <MoveRight className="h-4 w-4" />, title: "Arrow" },
    { tool: "text", icon: <Type className="h-4 w-4" />, title: "Text" },
    { tool: "eraser", icon: <Eraser className="h-4 w-4" />, title: "Eraser" },
  ];

  const PALETTE = ["#18181b", "#6366f1", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];

  return (
    <>
      {/* Top bar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-white/90 backdrop-blur border border-border/50 shadow-sm px-3 py-1.5 rounded-lg">
        <span className="text-sm font-semibold text-foreground">{roomName}</span>
        <div className="w-px h-4 bg-border" />
        <div className="flex -space-x-1.5">
          {[{ id: "me", name: userName }, ...users.filter(u => u.name !== userName)].slice(0, 6).map((u) => (
            <div
              key={u.id}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-white"
              style={{ backgroundColor: hashColor(u.id) }}
              title={u.name}
            >
              {u.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={handleCopyLink}>
          <Share2 className="h-3 w-3" /> Share
        </Button>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-white/90 backdrop-blur border border-border/50 shadow-sm px-2 py-1.5 rounded-lg">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setZoom(z => Math.min(5, z * 1.2))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.2, z / 1.2))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white/95 backdrop-blur border border-border/60 shadow-lg px-3 py-2 rounded-2xl">
        {TOOLS.map(({ tool, icon, title }) => (
          <button
            key={tool}
            title={title}
            onClick={() => setActiveTool(tool)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              activeTool === tool
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {icon}
          </button>
        ))}
        <div className="w-px h-6 bg-border mx-1.5" />
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-6 h-6 rounded-full border-2 transition-transform"
            style={{
              backgroundColor: c,
              borderColor: color === c ? "#6366f1" : "transparent",
              transform: color === c ? "scale(1.2)" : "scale(1)",
            }}
          />
        ))}
        <div className="w-px h-6 bg-border mx-1.5" />
        {[2, 4, 8].map((w) => (
          <button
            key={w}
            onClick={() => setStrokeWidth(w)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              strokeWidth === w ? "bg-muted" : "hover:bg-muted/50"
            }`}
          >
            <div className="rounded-full bg-foreground" style={{ width: w + 4, height: w + 4 }} />
          </button>
        ))}
        <div className="w-px h-6 bg-border mx-1.5" />
        <button
          title="Clear Board"
          onClick={handleClearBoard}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{ cursor: activeTool === "select" ? "default" : activeTool === "text" ? "text" : "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { isDrawing.current = false; isPanning.current = false; }}
        onWheel={handleWheel}
      />
    </>
  );
}
