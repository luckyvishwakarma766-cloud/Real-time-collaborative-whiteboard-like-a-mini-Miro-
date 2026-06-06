import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, roomsTable, elementsTable } from "@workspace/db";
import {
  CreateRoomBody,
  GetRoomParams,
  GetRoomElementsParams,
  ClearRoomParams,
  GetRoomStatsParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { generateRoomName } from "../lib/roomNames";

const router: IRouter = Router();

router.post("/rooms", async (req, res): Promise<void> => {
  const parsed = CreateRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = randomUUID();
  const name = parsed.data.name || generateRoomName();

  const [room] = await db
    .insert(roomsTable)
    .values({ id, name })
    .returning();

  res.status(201).json({
    id: room.id,
    name: room.name,
    createdAt: room.createdAt.toISOString(),
  });
});

router.get("/rooms/:roomId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
  const params = GetRoomParams.safeParse({ roomId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, params.data.roomId));

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json({
    id: room.id,
    name: room.name,
    createdAt: room.createdAt.toISOString(),
  });
});

router.get("/rooms/:roomId/elements", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
  const params = GetRoomElementsParams.safeParse({ roomId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, params.data.roomId));

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const elements = await db
    .select()
    .from(elementsTable)
    .where(eq(elementsTable.roomId, params.data.roomId))
    .orderBy(elementsTable.createdAt);

  res.json(
    elements.map((el) => ({
      id: el.id,
      roomId: el.roomId,
      type: el.type,
      data: el.data,
      createdAt: el.createdAt.toISOString(),
    }))
  );
});

router.delete("/rooms/:roomId/elements", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
  const params = ClearRoomParams.safeParse({ roomId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(elementsTable)
    .where(eq(elementsTable.roomId, params.data.roomId));

  res.json({ success: true });
});

router.get("/rooms/:roomId/stats", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
  const params = GetRoomStatsParams.safeParse({ roomId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const elements = await db
    .select({ type: elementsTable.type })
    .from(elementsTable)
    .where(eq(elementsTable.roomId, params.data.roomId));

  const byType: Record<string, number> = { pen: 0, rect: 0, ellipse: 0, arrow: 0, text: 0 };
  for (const el of elements) {
    if (el.type in byType) byType[el.type]++;
  }

  res.json({
    totalElements: elements.length,
    activeUsers: 0,
    byType,
  });
});

export default router;
