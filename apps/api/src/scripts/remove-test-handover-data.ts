import { type PoolClient, type Pool } from "pg";
import { getDatabasePool } from "../infrastructure/database/database.js";

export interface HandoverCleanupOptions {
  confirm?: boolean;
  client?: PoolClient;
  silent?: boolean;
}

export interface MatchedEmployeeInfo {
  id: string;
  name: string;
  employee_code: string | null;
  biometric_id: string | number;
  department: string | null;
  active: boolean;
}

export interface MatchedShiftInfo {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface HandoverCleanupResult {
  matchedEmployee: MatchedEmployeeInfo | null;
  matchedShift: MatchedShiftInfo | null;
  matchedBiometricIds: number[];
  preservedDeviceCount: number;
  tableCounts: Record<string, number>;
  totalDeleted: number;
  isConfirmed: boolean;
}

async function checkTableExists(client: PoolClient, tableName: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
    [tableName]
  );
  return Boolean(res.rows[0]?.exists);
}

export async function removeTestHandoverData(options: HandoverCleanupOptions = {}): Promise<HandoverCleanupResult> {
  const isConfirmed = Boolean(options.confirm);
  const isSilent = Boolean(options.silent);
  const externalClient = options.client;

  const pool: Pool | null = externalClient ? null : getDatabasePool();
  const client: PoolClient = externalClient ?? (await pool!.connect());

  const isExternalTransaction = Boolean(externalClient);

  try {
    if (!isExternalTransaction) {
      await client.query("BEGIN");
    }

    // 1. Check Preserved Device Count & Ensure devices table exists
    const deviceCountRes = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM devices");
    const preservedDeviceCount = Number.parseInt(deviceCountRes.rows[0]?.count ?? "0", 10);

    // 2. Locate Test Employee (must be inactive)
    const empCandidates = await client.query<MatchedEmployeeInfo>(
      `SELECT id, name, employee_code, biometric_id, department, active
       FROM employees
       WHERE active = false
         AND (LOWER(TRIM(name)) = 'test'
          OR TRIM(employee_code) = '1'
          OR biometric_id = 14
          OR LOWER(TRIM(department)) = 'cheif')`
    );

    if (empCandidates.rows.length > 1) {
      throw new Error(
        `Safety Check Failure: More than one employee matches test criteria (${empCandidates.rows.length} found). Expected at most 1. Aborting cleanup.`
      );
    }

    let matchedEmployee: MatchedEmployeeInfo | null = null;
    if (empCandidates.rows.length === 1) {
      const candidate = empCandidates.rows[0]!;
      const bioId = Number(candidate.biometric_id);
      const name = candidate.name.trim().toLowerCase();
      const code = candidate.employee_code?.trim() ?? "";
      const dept = candidate.department?.trim().toLowerCase() ?? "";

      if (bioId !== 14 || name !== "test" || code !== "1" || dept !== "cheif" || candidate.active !== false) {
        throw new Error(
          `Safety Check Failure: Employee matching test criteria does not strictly match test specs (Name: '${candidate.name}', Code: '${candidate.employee_code}', Bio: ${candidate.biometric_id}, Dept: '${candidate.department}', Active: ${candidate.active}). Aborting cleanup.`
        );
      }
      matchedEmployee = candidate;
    }

    // 3. Locate Test Shift (must be inactive)
    const shiftCandidates = await client.query<MatchedShiftInfo>(
      `SELECT id, name, start_time::text, end_time::text, active
       FROM shifts
       WHERE active = false
         AND (LOWER(TRIM(name)) = 'eve'
          OR (start_time::text LIKE '17:00%' AND end_time::text LIKE '22:40%'))`
    );

    if (shiftCandidates.rows.length > 1) {
      throw new Error(
        `Safety Check Failure: More than one shift matches test criteria (${shiftCandidates.rows.length} found). Expected at most 1. Aborting cleanup.`
      );
    }

    let matchedShift: MatchedShiftInfo | null = null;
    if (shiftCandidates.rows.length === 1) {
      const candidate = shiftCandidates.rows[0]!;
      const name = candidate.name.trim().toLowerCase();
      const start = candidate.start_time;
      const end = candidate.end_time;

      if (name !== "eve" || !start.startsWith("17:00") || !end.startsWith("22:40") || candidate.active !== false) {
        throw new Error(
          `Safety Check Failure: Shift matching test criteria does not strictly match test specs (Name: '${candidate.name}', Start: '${start}', End: '${end}', Active: ${candidate.active}). Aborting cleanup.`
        );
      }
      matchedShift = candidate;
    }

    // 4. Validate Target Biometric IDs (14, 25) Safety
    const targetBiometricIds = [14, 25];

    const bio25Check = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM employees WHERE biometric_id = 25"
    );
    if (bio25Check.rows.length > 0) {
      const bio25Emp = bio25Check.rows[0]!;
      if (bio25Emp.id !== matchedEmployee?.id) {
        throw new Error(
          `Safety Check Failure: Biometric ID 25 is assigned to an active or unrelated employee ('${bio25Emp.name}', ID: ${bio25Emp.id}). Unexpected deletion would occur. Aborting cleanup.`
        );
      }
    }

    // 5. Validate Test Shift Safety (Ensure no unrelated employee is assigned to or recorded on test shift)
    if (matchedShift) {
      const dummyId = "00000000-0000-0000-0000-000000000000";
      const empIdForCheck = matchedEmployee?.id ?? dummyId;

      const assignmentCheck = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM employee_shift_assignments WHERE shift_id = $1 AND employee_id != $2",
        [matchedShift.id, empIdForCheck]
      );
      if (Number.parseInt(assignmentCheck.rows[0]?.count ?? "0", 10) > 0) {
        throw new Error(
          `Safety Check Failure: Test shift (ID: ${matchedShift.id}) is assigned to unrelated employee(s). Aborting cleanup.`
        );
      }

      const dailyAttCheck = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM daily_attendance_records WHERE shift_id = $1 AND (employee_id IS NULL OR employee_id != $2)",
        [matchedShift.id, empIdForCheck]
      );
      if (Number.parseInt(dailyAttCheck.rows[0]?.count ?? "0", 10) > 0) {
        throw new Error(
          `Safety Check Failure: Test shift (ID: ${matchedShift.id}) has daily attendance records belonging to unrelated employee(s). Aborting cleanup.`
        );
      }

      const exceptionCheck = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM attendance_exceptions WHERE shift_id = $1 AND employee_id != $2",
        [matchedShift.id, empIdForCheck]
      );
      if (Number.parseInt(exceptionCheck.rows[0]?.count ?? "0", 10) > 0) {
        throw new Error(
          `Safety Check Failure: Test shift (ID: ${matchedShift.id}) has attendance exceptions belonging to unrelated employee(s). Aborting cleanup.`
        );
      }
    }

    // 6. Gather IDs for dependent cascades
    const empId = matchedEmployee?.id ?? null;
    const shiftId = matchedShift?.id ?? null;

    let payrollRecordIds: string[] = [];
    if (empId) {
      const recs = await client.query<{ id: string }>(
        "SELECT id FROM employee_payroll_records WHERE employee_id = $1",
        [empId]
      );
      payrollRecordIds = recs.rows.map((r) => r.id);
    }

    let payrollPaymentIds: string[] = [];
    if (empId || payrollRecordIds.length > 0) {
      const pmts = await client.query<{ id: string }>(
        "SELECT id FROM payroll_payments WHERE employee_id = $1 OR payroll_record_id = ANY($2::uuid[])",
        [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
      );
      payrollPaymentIds = pmts.rows.map((r) => r.id);
    }

    const rawPunchesRes = await client.query<{ id: string }>(
      "SELECT id FROM raw_attendance_punches WHERE biometric_id = ANY($1::bigint[])",
      [targetBiometricIds]
    );
    const rawPunchIds = rawPunchesRes.rows.map((r) => r.id);

    // 7. Check table existence for legacy tables
    const hasSalaryHistoryLegacy = await checkTableExists(client, "salary_history");
    const hasAdvanceTxLegacy = await checkTableExists(client, "advance_transactions");

    // 8. Count Affected Records Per Table BEFORE deletion
    const tableCounts: Record<string, number> = {};

    const countQuery = async (table: string, sql: string, params: unknown[]): Promise<number> => {
      const res = await client.query<{ count: string }>(sql, params);
      const c = Number.parseInt(res.rows[0]?.count ?? "0", 10);
      tableCounts[table] = c;
      return c;
    };

    await countQuery(
      "payroll_reset_audits",
      "SELECT COUNT(*)::text AS count FROM payroll_reset_audits WHERE employee_payroll_record_id = ANY($1::uuid[]) OR payment_id = ANY($2::uuid[])",
      [payrollRecordIds, payrollPaymentIds]
    );

    await countQuery(
      "payroll_payment_audit",
      "SELECT COUNT(*)::text AS count FROM payroll_payment_audit WHERE payroll_payment_id = ANY($1::uuid[])",
      [payrollPaymentIds]
    );

    await countQuery(
      "payroll_slips",
      "SELECT COUNT(*)::text AS count FROM payroll_slips WHERE (employee_id IS NOT NULL AND employee_id = $1) OR employee_payroll_record_id = ANY($2::uuid[])",
      [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
    );

    await countQuery(
      "payroll_payments",
      "SELECT COUNT(*)::text AS count FROM payroll_payments WHERE (employee_id IS NOT NULL AND employee_id = $1) OR payroll_record_id = ANY($2::uuid[])",
      [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
    );

    await countQuery(
      "payroll_adjustments",
      "SELECT COUNT(*)::text AS count FROM payroll_adjustments WHERE payroll_record_id = ANY($1::uuid[])",
      [payrollRecordIds]
    );

    await countQuery(
      "payroll_deductions",
      "SELECT COUNT(*)::text AS count FROM payroll_deductions WHERE payroll_record_id = ANY($1::uuid[])",
      [payrollRecordIds]
    );

    await countQuery(
      "employee_advance_transactions",
      "SELECT COUNT(*)::text AS count FROM employee_advance_transactions WHERE (employee_id = $1) OR payroll_record_id = ANY($2::uuid[])",
      [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
    );

    if (hasAdvanceTxLegacy) {
      await countQuery(
        "advance_transactions",
        "SELECT COUNT(*)::text AS count FROM advance_transactions WHERE employee_id = $1",
        [empId ?? "00000000-0000-0000-0000-000000000000"]
      );
    }

    await countQuery(
      "employee_payroll_records",
      "SELECT COUNT(*)::text AS count FROM employee_payroll_records WHERE employee_id = $1",
      [empId ?? "00000000-0000-0000-0000-000000000000"]
    );

    await countQuery(
      "employee_salary_history",
      "SELECT COUNT(*)::text AS count FROM employee_salary_history WHERE employee_id = $1",
      [empId ?? "00000000-0000-0000-0000-000000000000"]
    );

    if (hasSalaryHistoryLegacy) {
      await countQuery(
        "salary_history",
        "SELECT COUNT(*)::text AS count FROM salary_history WHERE employee_id = $1",
        [empId ?? "00000000-0000-0000-0000-000000000000"]
      );
    }

    await countQuery(
      "employee_shift_assignments",
      "SELECT COUNT(*)::text AS count FROM employee_shift_assignments WHERE employee_id = $1 OR shift_id = $2",
      [empId ?? "00000000-0000-0000-0000-000000000000", shiftId ?? "00000000-0000-0000-0000-000000000000"]
    );

    await countQuery(
      "attendance_exceptions",
      "SELECT COUNT(*)::text AS count FROM attendance_exceptions WHERE employee_id = $1 OR shift_id = $2 OR biometric_id = ANY($3::bigint[]) OR raw_punch_id = ANY($4::bigint[])",
      [
        empId ?? "00000000-0000-0000-0000-000000000000",
        shiftId ?? "00000000-0000-0000-0000-000000000000",
        targetBiometricIds,
        rawPunchIds,
      ]
    );

    await countQuery(
      "daily_attendance_records",
      "SELECT COUNT(*)::text AS count FROM daily_attendance_records WHERE employee_id = $1 OR shift_id = $2 OR biometric_id = ANY($3::bigint[])",
      [
        empId ?? "00000000-0000-0000-0000-000000000000",
        shiftId ?? "00000000-0000-0000-0000-000000000000",
        targetBiometricIds,
      ]
    );

    await countQuery(
      "raw_attendance_punches",
      "SELECT COUNT(*)::text AS count FROM raw_attendance_punches WHERE biometric_id = ANY($1::bigint[])",
      [targetBiometricIds]
    );

    await countQuery(
      "shift_sessions",
      "SELECT COUNT(*)::text AS count FROM shift_sessions WHERE shift_id = $1",
      [shiftId ?? "00000000-0000-0000-0000-000000000000"]
    );

    tableCounts["employees"] = empId ? 1 : 0;
    tableCounts["shifts"] = shiftId ? 1 : 0;

    const totalDeleted = Object.values(tableCounts).reduce((sum, val) => sum + val, 0);

    // 9. Print Matched Specs and Affected Counts
    if (!isSilent) {
      console.log("\n=======================================================");
      console.log("=== TEST DATA HANDOVER CLEANUP REPORT ===");
      console.log("=======================================================");
      console.log("Matched Employee:");
      if (matchedEmployee) {
        console.log(`  - ID:           ${matchedEmployee.id}`);
        console.log(`  - Name:         ${matchedEmployee.name}`);
        console.log(`  - Code:         ${matchedEmployee.employee_code}`);
        console.log(`  - Biometric ID: ${matchedEmployee.biometric_id}`);
        console.log(`  - Department:   ${matchedEmployee.department}`);
        console.log(`  - Active:       ${matchedEmployee.active}`);
      } else {
        console.log("  - None");
      }

      console.log("\nMatched Shift:");
      if (matchedShift) {
        console.log(`  - ID:         ${matchedShift.id}`);
        console.log(`  - Name:       ${matchedShift.name}`);
        console.log(`  - Start Time: ${matchedShift.start_time}`);
        console.log(`  - End Time:   ${matchedShift.end_time}`);
        console.log(`  - Active:     ${matchedShift.active}`);
      } else {
        console.log("  - None");
      }

      console.log("\nMatched Biometric IDs:");
      console.log(`  - IDs: ${targetBiometricIds.join(", ")}`);

      console.log("\nPreserved Biometric Devices:");
      console.log(`  - Total Preserved Devices: ${preservedDeviceCount}`);

      console.log("\nAffected Table Counts (Pending Deletion):");
      for (const [tbl, cnt] of Object.entries(tableCounts)) {
        console.log(`  - ${tbl.padEnd(30)}: ${cnt}`);
      }
      console.log(`\n  TOTAL TEST RECORDS TO DELETE  : ${totalDeleted}`);
      console.log("=======================================================\n");
    }

    // 10. Execute Deletions (In exact order to respect FK constraints)
    await client.query(
      "DELETE FROM payroll_reset_audits WHERE employee_payroll_record_id = ANY($1::uuid[]) OR payment_id = ANY($2::uuid[])",
      [payrollRecordIds, payrollPaymentIds]
    );

    await client.query(
      "DELETE FROM payroll_payment_audit WHERE payroll_payment_id = ANY($1::uuid[])",
      [payrollPaymentIds]
    );

    await client.query(
      "DELETE FROM payroll_slips WHERE (employee_id IS NOT NULL AND employee_id = $1) OR employee_payroll_record_id = ANY($2::uuid[])",
      [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
    );

    await client.query(
      "DELETE FROM payroll_payments WHERE (employee_id IS NOT NULL AND employee_id = $1) OR payroll_record_id = ANY($2::uuid[])",
      [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
    );

    await client.query(
      "DELETE FROM payroll_adjustments WHERE payroll_record_id = ANY($1::uuid[])",
      [payrollRecordIds]
    );

    await client.query(
      "DELETE FROM payroll_deductions WHERE payroll_record_id = ANY($1::uuid[])",
      [payrollRecordIds]
    );

    await client.query(
      "DELETE FROM employee_advance_transactions WHERE (employee_id = $1) OR payroll_record_id = ANY($2::uuid[])",
      [empId ?? "00000000-0000-0000-0000-000000000000", payrollRecordIds]
    );

    if (hasAdvanceTxLegacy) {
      await client.query(
        "DELETE FROM advance_transactions WHERE employee_id = $1",
        [empId ?? "00000000-0000-0000-0000-000000000000"]
      );
    }

    await client.query(
      "DELETE FROM employee_payroll_records WHERE employee_id = $1",
      [empId ?? "00000000-0000-0000-0000-000000000000"]
    );

    await client.query(
      "DELETE FROM employee_salary_history WHERE employee_id = $1",
      [empId ?? "00000000-0000-0000-0000-000000000000"]
    );

    if (hasSalaryHistoryLegacy) {
      await client.query(
        "DELETE FROM salary_history WHERE employee_id = $1",
        [empId ?? "00000000-0000-0000-0000-000000000000"]
      );
    }

    await client.query(
      "DELETE FROM employee_shift_assignments WHERE employee_id = $1 OR shift_id = $2",
      [empId ?? "00000000-0000-0000-0000-000000000000", shiftId ?? "00000000-0000-0000-0000-000000000000"]
    );

    await client.query(
      "DELETE FROM attendance_exceptions WHERE employee_id = $1 OR shift_id = $2 OR biometric_id = ANY($3::bigint[]) OR raw_punch_id = ANY($4::bigint[])",
      [
        empId ?? "00000000-0000-0000-0000-000000000000",
        shiftId ?? "00000000-0000-0000-0000-000000000000",
        targetBiometricIds,
        rawPunchIds,
      ]
    );

    await client.query(
      "DELETE FROM daily_attendance_records WHERE employee_id = $1 OR shift_id = $2 OR biometric_id = ANY($3::bigint[])",
      [
        empId ?? "00000000-0000-0000-0000-000000000000",
        shiftId ?? "00000000-0000-0000-0000-000000000000",
        targetBiometricIds,
      ]
    );

    await client.query(
      "DELETE FROM raw_attendance_punches WHERE biometric_id = ANY($1::bigint[])",
      [targetBiometricIds]
    );

    await client.query(
      "DELETE FROM shift_sessions WHERE shift_id = $1",
      [shiftId ?? "00000000-0000-0000-0000-000000000000"]
    );

    if (empId) {
      await client.query("DELETE FROM employees WHERE id = $1", [empId]);
    }

    if (shiftId) {
      await client.query("DELETE FROM shifts WHERE id = $1", [shiftId]);
    }

    // 11. Final Verification: Ensure Biometric Devices were NOT modified
    const postDeviceCountRes = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM devices");
    const postDeviceCount = Number.parseInt(postDeviceCountRes.rows[0]?.count ?? "0", 10);

    if (postDeviceCount !== preservedDeviceCount) {
      throw new Error(
        `Safety Violation: Biometric devices count changed from ${preservedDeviceCount} to ${postDeviceCount}. Aborting cleanup and rolling back.`
      );
    }

    // 12. Transaction Decision
    if (isConfirmed) {
      if (!isExternalTransaction) {
        await client.query("COMMIT");
      }
      if (!isSilent) {
        console.log("[CONFIRMED MODE] Transaction committed successfully. All listed test data removed.");
      }
    } else {
      if (!isExternalTransaction) {
        await client.query("ROLLBACK");
      }
      if (!isSilent) {
        console.log("[DRY RUN MODE] Transaction rolled back. No changes were made to the database.");
      }
    }

    return {
      matchedEmployee,
      matchedShift,
      matchedBiometricIds: targetBiometricIds,
      preservedDeviceCount,
      tableCounts,
      totalDeleted,
      isConfirmed,
    };
  } catch (error) {
    if (!isExternalTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback secondary error
      }
    }
    throw error;
  } finally {
    if (!isExternalTransaction) {
      client.release();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");

  try {
    const result = await removeTestHandoverData({ confirm });
    if (!result.isConfirmed) {
      console.log("\nDry-run completed successfully.");
      console.log("Re-run with --confirm to execute actual deletion.");
    } else {
      console.log("\nConfirmed deletion completed successfully.");
    }
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("\nERROR:", msg);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("remove-test-handover-data")) {
  main().catch((err: unknown) => {
    console.error("Fatal error running cleanup script:", err);
    process.exit(1);
  });
}
