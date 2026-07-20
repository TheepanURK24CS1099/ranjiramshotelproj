/* eslint-disable no-undef */
exports.up = (pgm) => {
  // Alter app_users
  pgm.sql(`
    ALTER TABLE app_users 
      ADD COLUMN last_login_at timestamptz,
      ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN locked_until timestamptz;
  `);

  pgm.sql(`
    ALTER TABLE app_users 
      ADD CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN', 'MANAGER'));
  `);

  // Create auth_sessions
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      last_used_at timestamptz,
      user_agent text,
      ip_address inet,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql("CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);");
  pgm.sql("CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions (token_hash);");
  pgm.sql("CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);");
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS auth_sessions;");
  
  pgm.sql("ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;");
  
  pgm.sql(`
    ALTER TABLE app_users 
      DROP COLUMN IF EXISTS last_login_at,
      DROP COLUMN IF EXISTS failed_login_attempts,
      DROP COLUMN IF EXISTS locked_until;
  `);
};
