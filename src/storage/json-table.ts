import type { z } from "zod";

/**
 * A SQLite table of JSON documents keyed by id. Rows are validated on read,
 * so a row written by an older schema is skipped instead of crashing the agent.
 */
export class JsonTable<T extends { id: string }> {
  constructor(
    private readonly sql: SqlStorage,
    private readonly table: string,
    private readonly schema: z.ZodType<T>
  ) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    );
  }

  list(limit = 500): T[] {
    const rows = this.sql
      .exec<{ data: string }>(
        `SELECT data FROM ${this.table} ORDER BY created_at DESC LIMIT ?`,
        limit
      )
      .toArray();
    return rows.flatMap((row) => this.parse(row.data));
  }

  get(id: string): T | undefined {
    const row = this.sql
      .exec<{ data: string }>(`SELECT data FROM ${this.table} WHERE id = ?`, id)
      .toArray()[0];
    return row ? this.parse(row.data)[0] : undefined;
  }

  put(item: T, createdAt: string): void {
    this.sql.exec(
      `INSERT INTO ${this.table} (id, data, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      item.id,
      JSON.stringify(item),
      createdAt
    );
  }

  delete(id: string): boolean {
    return (
      this.sql.exec(`DELETE FROM ${this.table} WHERE id = ?`, id).rowsWritten >
      0
    );
  }

  private parse(data: string): T[] {
    const result = this.schema.safeParse(JSON.parse(data));
    return result.success ? [result.data] : [];
  }
}
