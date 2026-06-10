export interface DatabaseHealth {
  driver: "better-sqlite3";
  ready: boolean;
}

export function getDatabaseHealth(): DatabaseHealth {
  return {
    driver: "better-sqlite3",
    ready: false
  };
}
