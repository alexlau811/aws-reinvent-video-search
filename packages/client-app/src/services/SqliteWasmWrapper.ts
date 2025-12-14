// Wrapper for SQLite WASM to enable easier mocking
export async function initializeSqliteWasm() {
  const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default
  return await sqlite3InitModule()
}