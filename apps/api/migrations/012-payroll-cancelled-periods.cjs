/* eslint-disable no-undef */

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = 'payroll_periods'::regclass
          AND con.contype = 'u'
          AND con.conkey = ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'payroll_periods'::regclass AND attname = 'year'),
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'payroll_periods'::regclass AND attname = 'month')
          ]
      LOOP
        EXECUTE format('ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS %I', constraint_name);
      END LOOP;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS payroll_periods_active_year_month_unique
      ON payroll_periods(year, month)
      WHERE status <> 'CANCELLED';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS payroll_periods_active_year_month_unique;
    ALTER TABLE payroll_periods
      ADD CONSTRAINT payroll_periods_year_month_unique UNIQUE(year, month);
  `);
};
