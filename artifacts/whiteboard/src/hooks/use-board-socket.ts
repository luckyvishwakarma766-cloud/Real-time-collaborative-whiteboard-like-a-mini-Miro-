import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "@/lib/socket";
import type { CanvasElement } from "@workspace/api-client-react";

export type User = {
  id: string;
  name: string;
};

export type Cursor = {
  userId: string;
  userName: string;
  x: number;
  y: number;
};

export function useBoardSocket(roomId: string, userName: string, initialElements: CanvasElement[]) {
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [elements, setElements] = useState<Record<string, CanvasElement>>({});
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});

  useEffect(() => {
    const initialMap = initialElements.reduce((acc, el) => {
      acc[el.id] = el;
      return acc;
    }, {} as Record<string, CanvasElement>);
    setElements(initialMap);
  }, [initialElements]);

  useEffect(() => {
    socket.connect();

    socket.emit("join-room", { roomId, userName });

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("room-users", ({ users }: { users: User[] }) => {
      setUsers(users);
    });

    socket.on("element-added", (element: CanvasElement) => {
      setElements((prev) => ({ ...prev, [element.id]: element }));
    });

    socket.on("element-updated", ({ elementId, data }: { elementId: string; data: string }) => {
      setElements((prev) => {
        if (!prev[elementId]) return prev;
        return { ...prev, [elementId]: { ...prev[elementId], data } };
      });
    });

    socket.on("element-deleted", ({ elementId }: { elementId: string }) => {
      setElements((prev) => {
        const next = { ...prev };
        delete next[elementId];
        return next;
      });
    });

    socket.on("board-cleared", () => {
      setElements({});
    });

    socket.on("cursor-update", (cursor: Cursor) => {
      setCursors((prev) => ({ ...prev, [cursor.userId]: cursor }));
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room-users");
      socket.off("element-added");
      socket.off("element-updated");
      socket.off("element-deleted");
      socket.off("board-cleared");
      socket.off("cursor-update");
      socket.disconnect();
    };
  }, [roomId, userName]);

  const addElement = useCallback((element: CanvasElement) => {
    setElements((prev) => ({ ...prev, [element.id]: element }));
    socket.emit("draw-element", { roomId, element });
  }, [roomId]);

  const updateElement = useCallback((elementId: string, data: string) => {
    setElements((prev) => {
      if (!prev[elementId]) return prev;
      return { ...prev, [elementId]: { ...prev[elementId], data } };
    });
    socket.emit("update-element", { roomId, elementId, data });
  }, [roomId]);

  const deleteElement = useCallback((elementId: string) => {
    setElements((prev) => {
      const next = { ...prev };
      delete next[elementId];
      return next;
    });
    socket.emit("delete-element", { roomId, elementId });
  }, [roomId]);

  const clearBoard = useCallback(() => {
    setElements({});
    socket.emit("clear-board", { roomId });
  }, [roomId]);

  const updateCursor = useCallback((x: number, y: number) => {
    socket.emit("cursor-move", { roomId, x, y, userName });
  }, [roomId, userName]);

  return {
    isConnected,
    users,
    elements: Object.values(elements),
    cursors,
    addElement,
    updateElement,
    deleteElement,
    clearBoard,
    updateCursor
  };
}
