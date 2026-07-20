import type { PoolConfig } from "pg";

export interface DatabasePoolConfig extends PoolConfig {
  application_name: string;
  connectionString: string;
}
