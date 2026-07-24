import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part7-${crypto.randomUUID()}`;

async function createSession(role: "ADMIN" | "MANAGER"): Promise<string> {
  const email = `${marker}-${role.toLowerCase()}@test.invalid`;
  const username = `${marker}-${role.toLowerCase()}`;
  const user = (
    await pool.query(
      "INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id",
      [email, username, role],
    )
  ).rows[0] as { id: string };
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "part7-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

describe("Part 7: Reports UI Polish", () => {
  let adminCookie = "";

  beforeAll(async () => {
    adminCookie = await createSession("ADMIN");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}%`]);
  });

  it("reports page source includes polished filter options, status badges, summary cards, and export buttons", () => {
    const pagePath = path.resolve(__dirname, "../../web/src/app/(authenticated)/reports/page.tsx");
    const content = fs.readFileSync(pagePath, "utf8");

    // Filter card & controls
    expect(content).toContain("Filter Options");
    expect(content).toContain("Apply Filters");
    expect(content).toContain("Clear Filters");
    expect(content).toContain("CSV / Excel");
    expect(content).toContain("Printable PDF");

    // Status badges & view report action
    expect(content).toContain("renderCell");
    expect(content).toContain("View Report");
    expect(content).toContain("/reports/attendance/employees/");

    // Unmatched section: collapsed by default, no raw punch controls
    expect(content).toContain("Historical / Unmatched Biometric IDs");
    expect(content).toContain("UnmatchedDetail");
    expect(content).not.toContain("raw-punch selection");
    expect(content).not.toContain("Delete Selected");

    // Layout responsiveness
    expect(content).toContain("grid-cols-1");
    expect(content).toContain("overflow-x-auto");
  });

  it("attendance-summary endpoint returns required registered employee report columns and summary metrics", async () => {
    const res = await request(app)
      .get("/reports/attendance-summary")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("summary");
    expect(res.body.summary).toHaveProperty("totalEmployees");
    expect(res.body.summary).toHaveProperty("historicalUnmatchedIds");

    if (res.body.items.length > 0) {
      const firstRow = res.body.items[0] as Record<string, unknown>;
      expect(firstRow).toHaveProperty("employee_name");
      expect(firstRow).toHaveProperty("employee_code");
      expect(firstRow).toHaveProperty("biometric_id");
      expect(firstRow).toHaveProperty("shift");
      expect(firstRow).toHaveProperty("active_status");
      expect(firstRow).toHaveProperty("present_days");
      expect(firstRow).toHaveProperty("absent_days");
      expect(firstRow).toHaveProperty("late_days");
      expect(firstRow).toHaveProperty("missing_punches");
      expect(firstRow).toHaveProperty("total_worked_hours");
      expect(firstRow).toHaveProperty("overtime_hours");
      expect(firstRow).toHaveProperty("view_report");
    }
  });
});
