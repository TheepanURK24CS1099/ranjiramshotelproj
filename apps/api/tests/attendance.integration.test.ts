import crypto from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { rebuildAttendanceForBiometricDate } from "../src/modules/attendance/attendance.repository.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part13-${crypto.randomUUID()}`;
const attendanceDate = "2026-07-20";
const previousDate = "2026-07-19";
const biometricIdBase = crypto.randomInt(20_000_000, 90_000_000);
const biometricIds = Array.from({ length: 13 }, (_, index) => biometricIdBase + index);
let managerCookie = "";
let endpointDeviceId = "";
let endpointShiftId = "";
let lateCheckoutPunchId = 0;
let nextDayPunchId = 0;
let farOutsidePunchId = 0;

function currentIstDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

async function createSession(role: "ADMIN" | "MANAGER"): Promise<string> {
  const email = `${marker}-${role.toLowerCase()}@test.invalid`;
  const username = `${marker}-${role.toLowerCase()}`;
  const user = (await pool.query("INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id", [email, username, role])).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "part13-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

async function createShift(name: string, startTime: string, endTime: string, isOvernight: boolean): Promise<string> {
  const result = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, is_overnight, active)
     VALUES ($1, $2, $3, 0, 0, $4, true)
     RETURNING id`,
    [name, startTime, endTime, isOvernight],
  );
  return result.rows[0].id as string;
}

async function createEmployee(biometricId: number, name: string, shiftId?: string, effectiveFrom = attendanceDate): Promise<string> {
  const employee = (await pool.query(
    `INSERT INTO employees (biometric_id, name, phone, department, designation, joining_date, weekly_off_day, active)
     VALUES ($1, $2, NULL, NULL, NULL, '2026-07-01', NULL, true)
     RETURNING id`,
    [biometricId, name],
  )).rows[0];
  const employeeId = employee.id as string;

  if (shiftId) {
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, $3::date)`,
      [employeeId, shiftId, effectiveFrom],
    );
  }

  return employeeId as string;
}

async function insertRawPunch(biometricId: number, punchTime: Date): Promise<string> {
  const sourceEventKey = `${marker}-${biometricId}-${punchTime.toISOString()}`;
  await pool.query(
    `INSERT INTO raw_attendance_punches (device_id, biometric_id, punch_time, punch_state, verify_mode, raw_payload, source_event_key)
     VALUES (NULL, $1, $2, NULL, NULL, '{}'::jsonb, $3)`,
    [biometricId, punchTime, sourceEventKey],
  );
  return sourceEventKey;
}

async function getRawPunchId(sourceEventKey: string): Promise<number> {
  const result = await pool.query("SELECT id FROM raw_attendance_punches WHERE source_event_key = $1", [sourceEventKey]);
  return Number(result.rows[0].id);
}

describe("Part 13 attendance engine", () => {
  let dayShiftId = "";
  let overnightShiftId = "";

  beforeAll(async () => {
    managerCookie = await createSession("MANAGER");

    dayShiftId = await createShift(`${marker}-day`, "09:00:00", "18:00:00", false);
    overnightShiftId = await createShift(`${marker}-night`, "22:00:00", "06:00:00", true);

    await createEmployee(biometricIds[0]!, `${marker}-normal`, dayShiftId);
    await createEmployee(biometricIds[1]!, `${marker}-overnight`, overnightShiftId);
    await createEmployee(biometricIds[2]!, `${marker}-single`, dayShiftId);
    await createEmployee(biometricIds[3]!, `${marker}-no-shift`);
    await createEmployee(biometricIds[12]!, `${marker}-late-checkout`, dayShiftId);

    await insertRawPunch(biometricIds[0]!, istDateTime(attendanceDate, "09:05:00"));
    await insertRawPunch(biometricIds[0]!, istDateTime(attendanceDate, "18:05:00"));
    farOutsidePunchId = await getRawPunchId(await insertRawPunch(biometricIds[0]!, istDateTime(attendanceDate, "06:00:00")));

    await insertRawPunch(biometricIds[1]!, istDateTime(attendanceDate, "22:10:00"));
    await insertRawPunch(biometricIds[1]!, istDateTime("2026-07-21", "05:50:00"));

    await insertRawPunch(biometricIds[2]!, istDateTime(attendanceDate, "10:00:00"));

    await insertRawPunch(biometricIds[3]!, istDateTime(attendanceDate, "11:00:00"));
    await insertRawPunch(biometricIds[3]!, istDateTime(attendanceDate, "12:00:00"));

    await insertRawPunch(biometricIds[4]!, istDateTime(attendanceDate, "13:00:00"));
    await insertRawPunch(biometricIds[5]!, new Date("2026-07-19T18:30:00.000Z"));

    await insertRawPunch(biometricIds[12]!, istDateTime(attendanceDate, "09:10:00"));
    lateCheckoutPunchId = await getRawPunchId(await insertRawPunch(biometricIds[12]!, istDateTime(attendanceDate, "22:30:00")));
    nextDayPunchId = await getRawPunchId(await insertRawPunch(biometricIds[12]!, istDateTime("2026-07-21", "09:00:00")));

    for (const biometricId of biometricIds.slice(0, 6)) {
      await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);
    }
    await rebuildAttendanceForBiometricDate(String(biometricIds[12]), attendanceDate);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE biometric_id = ANY($1::bigint[])", [biometricIds]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1 OR device_id = $2::uuid", [`${marker}%`, endpointDeviceId || null]);
    if (endpointDeviceId) await pool.query("DELETE FROM devices WHERE id = $1", [endpointDeviceId]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE biometric_id = ANY($1::bigint[]))", [biometricIds]);
    await pool.query("DELETE FROM employees WHERE biometric_id = ANY($1::bigint[])", [biometricIds]);
    await pool.query("DELETE FROM shifts WHERE id = ANY($1::uuid[])", [[dayShiftId, overnightShiftId, endpointShiftId].filter(Boolean)]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM app_users WHERE email LIKE $1", [`${marker}%`]);
  });

  it("rebuilds attendance for normal and overnight shifts", async () => {
    const response = await request(app).get(`/attendance?date=${attendanceDate}`).set("Cookie", managerCookie).expect(200);

    const normal = response.body.find((row: Record<string, unknown>) => String(row.biometric_id) === String(biometricIds[0]));
    const overnight = response.body.find((row: Record<string, unknown>) => String(row.biometric_id) === String(biometricIds[1]));

    expect(normal.status).toBe("PRESENT");
    expect(normal.shift_name).toBe(`${marker}-day`);
    expect(normal.working_minutes).toBeGreaterThanOrEqual(500);

    expect(overnight.status).toBe("PRESENT");
    expect(overnight.shift_name).toBe(`${marker}-night`);
    expect(overnight.attendance_date).toBe(attendanceDate);
    expect(overnight.working_minutes).toBeGreaterThanOrEqual(460);
  });

  it("uses a punch five minutes after a normal shift ends as Punch Out", async () => {
    const record = (await pool.query(
      `SELECT raw_punch_count, status,
              to_char(punch_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_out_ist
       FROM daily_attendance_records
       WHERE attendance_date = $1::date AND biometric_id = $2`,
      [attendanceDate, biometricIds[0]],
    )).rows[0];

    expect(record).toMatchObject({ raw_punch_count: 2, status: "PRESENT", punch_out_ist: "18:05" });
  });

  it("classifies a far outside-window punch without changing valid attendance", async () => {
    const attendance = (await pool.query(
      `SELECT raw_punch_count, status,
              to_char(punch_in_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_in_ist,
              to_char(punch_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_out_ist
       FROM daily_attendance_records
       WHERE attendance_date = $1::date AND biometric_id = $2`,
      [attendanceDate, biometricIds[0]],
    )).rows[0];
    const rawPunch = await pool.query("SELECT id FROM raw_attendance_punches WHERE id = $1", [farOutsidePunchId]);
    const response = await request(app).get(`/attendance/exceptions?date=${attendanceDate}`).set("Cookie", managerCookie).expect(200);
    const exception = response.body.find((row: Record<string, unknown>) => Number(row.raw_punch_id) === farOutsidePunchId);

    expect(attendance).toMatchObject({ raw_punch_count: 2, status: "PRESENT", punch_in_ist: "09:05", punch_out_ist: "18:05" });
    expect(rawPunch.rows).toHaveLength(1);
    expect(response.body.filter((row: Record<string, unknown>) => String(row.biometric_id) === String(biometricIds[0]))).toHaveLength(1);
    expect(exception).toMatchObject({
      employee_name: `${marker}-normal`,
      biometric_id: String(biometricIds[0]),
      shift_name: `${marker}-day`,
      exception_type: "OUT_OF_SHIFT",
      message: "Punch recorded outside assigned shift window",
    });
    expect(new Date(String(exception.punch_time)).toISOString()).toBe(istDateTime(attendanceDate, "06:00:00").toISOString());
  });

  it("uses the last punch within the checkout window several hours after shift end", async () => {
    const record = (await pool.query(
      `SELECT raw_punch_count, last_raw_punch_id,
              to_char(punch_in_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_in_ist,
              to_char(punch_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_out_ist
       FROM daily_attendance_records
       WHERE attendance_date = $1::date AND biometric_id = $2`,
      [attendanceDate, biometricIds[12]],
    )).rows[0];

    expect(record).toMatchObject({ raw_punch_count: 2, punch_in_ist: "09:10", punch_out_ist: "22:30" });
    expect(Number(record.last_raw_punch_id)).toBe(lateCheckoutPunchId);
  });

  it("does not absorb an unrelated punch from the next day", async () => {
    const record = (await pool.query(
      "SELECT raw_punch_count, last_raw_punch_id FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2",
      [attendanceDate, biometricIds[12]],
    )).rows[0];

    expect(record.raw_punch_count).toBe(2);
    expect(Number(record.last_raw_punch_id)).toBe(lateCheckoutPunchId);
    expect(Number(record.last_raw_punch_id)).not.toBe(nextDayPunchId);
  });

  it("keeps an overnight Punch Out after midnight on the previous attendance date", async () => {
    const record = (await pool.query(
      `SELECT attendance_date::text, raw_punch_count,
              to_char(punch_out_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS punch_out_ist
       FROM daily_attendance_records
       WHERE attendance_date = $1::date AND biometric_id = $2`,
      [attendanceDate, biometricIds[1]],
    )).rows[0];

    expect(record).toMatchObject({ attendance_date: attendanceDate, raw_punch_count: 2, punch_out_ist: "2026-07-21 05:50" });

    const exceptions = await request(app).get(`/attendance/exceptions?date=${attendanceDate}`).set("Cookie", managerCookie).expect(200);
    expect(exceptions.body.some((row: Record<string, unknown>) => String(row.biometric_id) === String(biometricIds[1]))).toBe(false);
  });

  it("marks a single punch as missing punch out", async () => {
    const response = await request(app).get(`/attendance?date=${attendanceDate}&status=MISSING_PUNCH`).set("Cookie", managerCookie).expect(200);
    const row = response.body.find((entry: Record<string, unknown>) => String(entry.biometric_id) === String(biometricIds[2]));

    expect(row.status).toBe("MISSING_PUNCH");
    expect(row.punch_out_at).toBeNull();
    expect(row.working_minutes).toBe(0);
  });

  it("marks a matched employee without shift as no shift", async () => {
    const response = await request(app).get(`/attendance?date=${attendanceDate}&status=NO_SHIFT`).set("Cookie", managerCookie).expect(200);
    const row = response.body.find((entry: Record<string, unknown>) => String(entry.biometric_id) === String(biometricIds[3]));

    expect(row.status).toBe("NO_SHIFT");
    expect(row.shift_name).toBeNull();
    expect(row.employee_name).toBe(`${marker}-no-shift`);
  });

  it("keeps unknown biometric IDs visible as unmatched punches", async () => {
    const response = await request(app).get(`/attendance?date=${attendanceDate}&status=UNMATCHED`).set("Cookie", managerCookie).expect(200);
    const row = response.body.find((entry: Record<string, unknown>) => String(entry.biometric_id) === String(biometricIds[4]));

    expect(row.status).toBe("UNMATCHED");
    expect(row.employee_name).toBeNull();
    expect(row.shift_name).toBeNull();
  });

  it("respects IST date boundaries", async () => {
    const currentDay = await request(app).get(`/attendance?date=${attendanceDate}&status=UNMATCHED`).set("Cookie", managerCookie).expect(200);
    const previousDay = await request(app).get(`/attendance?date=${previousDate}`).set("Cookie", managerCookie).expect(200);

    expect(currentDay.body.some((row: Record<string, unknown>) => String(row.biometric_id) === String(biometricIds[5]))).toBe(true);
    expect(previousDay.body.some((row: Record<string, unknown>) => String(row.biometric_id) === String(biometricIds[5]))).toBe(false);
  });

  it("does not duplicate attendance records on reprocessing", async () => {
    for (const biometricId of biometricIds.slice(0, 6)) {
      await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);
      await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);
    }

    const count = await pool.query(
      "SELECT count(*) FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = ANY($2::bigint[])",
      [attendanceDate, biometricIds.slice(0, 6)],
    );
    expect(Number(count.rows[0].count)).toBe(6);
  });

  it("shows attendance summary cards on the dashboard", async () => {
    // Dashboard summary always uses the current IST date.
    const dashboardDate = currentIstDate();
    const dashboardBiometricIds = biometricIds.slice(7, 12);
    const dashboardSourceEventKeys: string[] = [];
    const initialDashboard = await request(app).get("/dashboard/summary").set("Cookie", managerCookie).expect(200);

    try {
      await createEmployee(dashboardBiometricIds[0]!, `${marker}-dashboard-present-1`, dayShiftId, dashboardDate);
      await createEmployee(dashboardBiometricIds[1]!, `${marker}-dashboard-present-2`, dayShiftId, dashboardDate);
      await createEmployee(dashboardBiometricIds[2]!, `${marker}-dashboard-missing`, dayShiftId, dashboardDate);

      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[0]!, istDateTime(dashboardDate, "09:00:00")));
      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[0]!, istDateTime(dashboardDate, "18:00:00")));
      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[1]!, istDateTime(dashboardDate, "09:15:00")));
      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[1]!, istDateTime(dashboardDate, "17:45:00")));
      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[2]!, istDateTime(dashboardDate, "10:00:00")));
      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[3]!, istDateTime(dashboardDate, "11:00:00")));
      dashboardSourceEventKeys.push(await insertRawPunch(dashboardBiometricIds[4]!, istDateTime(dashboardDate, "12:00:00")));

      for (const biometricId of dashboardBiometricIds) {
        await rebuildAttendanceForBiometricDate(String(biometricId), dashboardDate);
      }

      const response = await request(app).get("/dashboard/summary").set("Cookie", managerCookie).expect(200);

      expect(response.body.presentToday).toBe(initialDashboard.body.presentToday + 2);
      expect(response.body.currentlyCheckedIn).toBe(initialDashboard.body.currentlyCheckedIn + 1);
      expect(response.body.missingPunchOut).toBe(initialDashboard.body.missingPunchOut);
      expect(response.body.unmatchedPunches).toBe(initialDashboard.body.unmatchedPunches + 2);
    } finally {
      await pool.query("DELETE FROM daily_attendance_records WHERE biometric_id = ANY($1::bigint[])", [dashboardBiometricIds]);
      await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key = ANY($1::text[])", [dashboardSourceEventKeys]);
      await pool.query(
        "DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE biometric_id = ANY($1::bigint[]))",
        [dashboardBiometricIds],
      );
      await pool.query("DELETE FROM employees WHERE biometric_id = ANY($1::bigint[])", [dashboardBiometricIds]);
    }
  });

  it("automatically rebuilds attendance and keeps duplicate punch submissions idempotent", async () => {
    const testDate = "2026-07-22";
    const biometricId = biometricIds[6]!;
    const deviceCode = `${marker}-device`;
    const deviceResult = await pool.query(
      "INSERT INTO devices (device_code, active, name) VALUES ($1, true, $2) RETURNING id",
      [deviceCode, marker],
    );
    endpointDeviceId = deviceResult.rows[0].id as string;

    endpointShiftId = await createShift(`${marker}-automatic`, "08:00:00", "17:00:00", false);
    await createEmployee(biometricId, `${marker}-automatic-employee`, endpointShiftId);
    const attlogPayload = `${biometricId}\t${testDate} 08:30:00\t0\t0\n${biometricId}\t${testDate} 17:05:00\t0\t0`;

    const firstResponse = await request(app)
      .post("/iclock/cdata")
      .query({ SN: deviceCode })
      .type("text/plain")
      .send(attlogPayload)
      .expect(200);
    expect(firstResponse.text).toBe("OK: 2");

    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2", [testDate, biometricId]);

    await request(app)
      .post("/iclock/cdata")
      .query({ SN: deviceCode })
      .type("text/plain")
      .send(attlogPayload)
      .expect(200);

    const rawPunches = await pool.query(
      "SELECT id FROM raw_attendance_punches WHERE device_id = $1 AND biometric_id = $2",
      [endpointDeviceId, biometricId],
    );
    const records = await pool.query(
      `SELECT status, punch_out_at, working_minutes,
              to_char(punch_in_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_in_ist
       FROM daily_attendance_records
       WHERE attendance_date = $1::date AND biometric_id = $2`,
      [testDate, biometricId],
    );

    expect(rawPunches.rows).toHaveLength(2);
    expect(records.rows).toHaveLength(1);
    expect(records.rows[0]).toMatchObject({
      status: "PRESENT",
      punch_in_ist: "08:30",
    });
    expect(records.rows[0].punch_out_at).not.toBeNull();
    expect(records.rows[0].working_minutes).toBe(515);
  });
});
