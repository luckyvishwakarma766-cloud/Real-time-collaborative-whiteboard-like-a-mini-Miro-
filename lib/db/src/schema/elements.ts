import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roomsTable } from "./rooms";

export const elementsTable = pgTable("canvas_elements", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => roomsTable.id),
  type: text("type").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertElementSchema = createInsertSchema(elementsTable);
export type InsertElement = z.infer<typeof insertElementSchema>;
export type CanvasElement = typeof elementsTable.$inferSelect;
