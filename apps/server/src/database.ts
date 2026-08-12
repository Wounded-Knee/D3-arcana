import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: databaseUrl,
});