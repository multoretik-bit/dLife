import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const schedules = sqliteTable("schedules", {
  userId: text("user_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull(),
});
