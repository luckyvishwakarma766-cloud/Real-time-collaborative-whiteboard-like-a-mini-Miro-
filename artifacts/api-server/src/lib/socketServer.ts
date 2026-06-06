import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db, roomsTable, elementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "./logger";

interface UserInfo {
  id: string;
  name: string;
}

const roomUsers = new Map<string, Map<string, UserInfo>>();

export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: "/ws/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    let currentRoomId: string | null = null;
    let currentUser: UserInfo | null = null;

    socket.on("join-room", async ({ roomId, userName }: { roomId: string; userName: string }) => {
      currentRoomId = roomId;
      currentUser = { id: socket.id, name: userName };

      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Map());
      }
      roomUsers.get(roomId)!.set(socket.id, currentUser);

      socket.join(roomId);

      const users = Array.from(roomUsers.get(roomId)!.values());
      io.to(roomId).emit("room-users", { users });

      logger.info({ roomId, userName, socketId: socket.id }, "User joined room");
    });

    socket.on("draw-element", async ({ roomId, element }: { roomId: string; element: { id: string; type: string; data: string } }) => {
      try {
        const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
        if (!room) return;

        const id = element.id || randomUUID();
        await db.insert(elementsTable).values({
          id,
          roomId,
          type: element.type,
          data: element.data,
        }).onConflictDoUpdate({
          target: elementsTable.id,
          set: { data: element.data },
        });

        socket.to(roomId).emit("element-added", {
          id,
          roomId,
          type: element.type,
          data: element.data,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error saving element");
      }
    });

    socket.on("update-element", ({ roomId, elementId, data }: { roomId: string; elementId: string; data: string }) => {
      socket.to(roomId).emit("element-updated", { elementId, data });
    });

    socket.on("delete-element", async ({ roomId, elementId }: { roomId: string; elementId: string }) => {
      try {
        await db.delete(elementsTable).where(eq(elementsTable.id, elementId));
        io.to(roomId).emit("element-deleted", { elementId });
      } catch (err) {
        logger.error({ err }, "Error deleting element");
      }
    });

    socket.on("clear-board", async ({ roomId }: { roomId: string }) => {
      try {
        await db.delete(elementsTable).where(eq(elementsTable.roomId, roomId));
        io.to(roomId).emit("board-cleared");
      } catch (err) {
        logger.error({ err }, "Error clearing board");
      }
    });

    socket.on("cursor-move", ({ roomId, x, y, userName }: { roomId: string; x: number; y: number; userName: string }) => {
      socket.to(roomId).emit("cursor-update", { userId: socket.id, x, y, userName });
    });

    socket.on("disconnect", () => {
      if (currentRoomId && currentUser) {
        const users = roomUsers.get(currentRoomId);
        if (users) {
          users.delete(socket.id);
          if (users.size === 0) {
            roomUsers.delete(currentRoomId);
          } else {
            io.to(currentRoomId).emit("room-users", {
              users: Array.from(users.values()),
            });
          }
        }
        logger.info({ roomId: currentRoomId, socketId: socket.id }, "User left room");
      }
    });
  });

  return io;
}
