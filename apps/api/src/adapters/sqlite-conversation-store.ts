import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ConversationDetail, ConversationSummary, Message } from '@jarvis/shared';
import type { ConversationStore } from '../ports/conversation-store';

/**
 * Idempotent schema creation. Exported separately so the app can apply it
 * to an injected database handle (tests) as well as to one it opens itself.
 */
export function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, id);
  `);
}

/**
 * Opens (creating if needed) the SQLite database and prepares it: WAL
 * journal for safe concurrent readers, hard foreign keys, and the schema.
 */
export function createDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  createSchema(db);
  return db;
}

interface ConversationRow {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface MessageRow {
  id: number;
  conversationId: number;
  role: Message['role'];
  content: string;
  createdAt: string;
}

/**
 * SQLite-backed ConversationStore (node:sqlite — zero native dependencies).
 * Columns are aliased to the contract's camelCase names on the way out so
 * rows match the shared zod contracts without an extra mapping layer.
 */
export class SQLiteConversationStore implements ConversationStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  createConversation(title: string, now: string): ConversationSummary {
    const result = this.db
      .prepare('INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)')
      .run(title, now, now);
    return this.getConversation(Number(result.lastInsertRowid))!;
  }

  listConversations(): ConversationSummary[] {
    return this.db
      .prepare(
        `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
         FROM conversations
         ORDER BY updated_at DESC, id DESC`,
      )
      .all() as unknown as ConversationRow[];
  }

  getConversation(id: number): ConversationDetail | undefined {
    const conversation = this.db
      .prepare(
        `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
         FROM conversations WHERE id = ?`,
      )
      .get(id) as ConversationRow | undefined;
    if (conversation === undefined) {
      return undefined;
    }
    const messages = this.db
      .prepare(
        `SELECT id, conversation_id AS conversationId, role, content, created_at AS createdAt
         FROM messages WHERE conversation_id = ?
         ORDER BY id ASC`,
      )
      .all(id) as unknown as MessageRow[];
    return { ...conversation, messages };
  }

  addMessage(input: {
    conversationId: number;
    role: Message['role'];
    content: string;
    now: string;
  }): Message | undefined {
    const { conversationId, role, content, now } = input;
    const exists = this.db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(conversationId);
    if (exists === undefined) {
      return undefined;
    }

    this.db.exec('BEGIN');
    try {
      const result = this.db
        .prepare(
          `INSERT INTO messages (conversation_id, role, content, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(conversationId, role, content, now);
      this.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(now, conversationId);
      this.db.exec('COMMIT');
      return this.db
        .prepare(
          `SELECT id, conversation_id AS conversationId, role, content, created_at AS createdAt
           FROM messages WHERE id = ?`,
        )
        .get(Number(result.lastInsertRowid)) as unknown as MessageRow;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  setTitle(id: number, title: string): boolean {
    const result = this.db
      .prepare('UPDATE conversations SET title = ? WHERE id = ?')
      .run(title, id);
    return result.changes > 0;
  }
}
