import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, feedback, InsertFeedback, waitlist, InsertWaitlist } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Known PPEI team openIds for auto-promotion on login
const OWNER_OPEN_ID = 'V2pCAkSwLyG7ZZ2xtxe89a'; // Kory Willis
const ADMIN_OPEN_IDS = new Set([
  'ksBHGV5iqfKpCgoi3TKgYG', // Erik (ppei.com)
  'nWh2tQUgLAjdSidvActMnF', // Erik Fontenot (yahoo.com)
  'firEtjYyGRNJ9ENvVTrCq3', // Carmen Savant
]);

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    // Auto-promote: owner → super_admin, known employees → admin
    if (user.openId === OWNER_OPEN_ID || user.openId === ENV.ownerOpenId) {
      values.role = 'super_admin';
      updateSet.role = 'super_admin';
      values.advancedAccess = 'approved';
      updateSet.advancedAccess = 'approved';
      values.accessLevel = 3;
      updateSet.accessLevel = 3;
    } else if (ADMIN_OPEN_IDS.has(user.openId)) {
      values.role = 'admin';
      updateSet.role = 'admin';
      values.advancedAccess = 'approved';
      updateSet.advancedAccess = 'approved';
      values.accessLevel = 3;
      updateSet.accessLevel = 3;
    } else if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Feedback ─────────────────────────────────────────────────────────────────────────
export async function insertWaitlistEmail(data: InsertWaitlist): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert waitlist email: database not available");
    return false;
  }
  try {
    await db.insert(waitlist).values(data);
    return true;
  } catch (error) {
    console.error("[Database] Failed to insert waitlist email:", error);
    return false;
  }
}

export async function insertFeedback(data: InsertFeedback): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert feedback: database not available");
    return false;
  }
  try {
    await db.insert(feedback).values(data);
    return true;
  } catch (error) {
    console.error("[Database] Failed to insert feedback:", error);
    return false;
  }
}
