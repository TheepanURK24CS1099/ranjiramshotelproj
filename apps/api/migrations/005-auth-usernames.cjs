/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql("ALTER TABLE app_users ADD COLUMN username text;");

  pgm.sql(`
    UPDATE app_users
    SET username =
      COALESCE(
        NULLIF(
          trim(BOTH '_' FROM regexp_replace(lower(split_part(trim(email), '@', 1)), '[^a-z0-9_]+', '_', 'g')),
          ''
        ),
        'user'
      ) || '_' || replace(id::text, '-', '');
  `);

  pgm.sql(`
    ALTER TABLE app_users
      ALTER COLUMN username SET NOT NULL,
      ADD CONSTRAINT app_users_username_not_empty CHECK (length(trim(username)) > 0);
  `);
  pgm.sql("CREATE UNIQUE INDEX app_users_username_ci_idx ON app_users (lower(username));");
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS app_users_username_ci_idx;");
  pgm.sql("ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_username_not_empty;");
  pgm.sql("ALTER TABLE app_users DROP COLUMN IF EXISTS username;");
};
