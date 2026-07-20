/* eslint-disable no-undef */
exports.up = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS devices_device_code_unique_idx;");
  pgm.sql("CREATE UNIQUE INDEX devices_device_code_ci_idx ON devices (lower(device_code));");
  pgm.sql("CREATE UNIQUE INDEX devices_serial_number_ci_idx ON devices (lower(serial_number)) WHERE NULLIF(trim(serial_number), '') IS NOT NULL;");
  pgm.sql("ALTER TABLE devices ALTER COLUMN status SET DEFAULT 'OFFLINE';");
  pgm.sql("ALTER TABLE devices ADD CONSTRAINT devices_code_not_empty CHECK (length(trim(device_code)) > 0);");
};

exports.down = (pgm) => {
  pgm.sql("ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_code_not_empty;");
  pgm.sql("ALTER TABLE devices ALTER COLUMN status DROP DEFAULT;");
  pgm.sql("DROP INDEX IF EXISTS devices_serial_number_ci_idx;");
  pgm.sql("DROP INDEX IF EXISTS devices_device_code_ci_idx;");
  pgm.sql("CREATE UNIQUE INDEX devices_device_code_unique_idx ON devices (device_code);");
};
