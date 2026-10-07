export const db = {
  async query(sql: string, ...params: unknown[]): Promise<unknown[]> {
    void sql;
    void params;
    return [];
  }
};
