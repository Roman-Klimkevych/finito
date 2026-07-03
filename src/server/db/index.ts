import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const client = new Database(process.env.DATABASE_URL ?? "./finito.db");

// WAL mode for better concurrent read performance
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });
export type DB = typeof db;
