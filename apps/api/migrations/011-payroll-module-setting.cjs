/* eslint-disable no-undef */
exports.up=(pgm)=>pgm.sql(`CREATE TABLE module_settings(module_name text PRIMARY KEY,payroll_enabled boolean NOT NULL DEFAULT true,updated_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,updated_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT module_settings_name CHECK(module_name='payroll')); INSERT INTO module_settings(module_name,payroll_enabled) VALUES('payroll',true);`);
exports.down=(pgm)=>pgm.sql("DROP TABLE IF EXISTS module_settings;");
