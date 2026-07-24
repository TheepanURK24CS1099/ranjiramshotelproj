import { previewCleanup, executeCleanup, type CleanupOptions } from "../modules/maintenance/cleanup-historical-punches.service.js";

function parseArgs(args: string[]): CleanupOptions {
  const options: CleanupOptions = {
    execute: false,
    preview: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--device-code" && args[i + 1]) {
      options.deviceCode = args[++i];
    } else if (arg === "--before" && args[i + 1]) {
      options.before = args[++i];
    } else if (arg === "--biometric-ids" && args[i + 1]) {
      const val = args[++i] ?? "";
      options.biometricIds = val
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((n) => !Number.isNaN(n));
    } else if (arg === "--execute") {
      options.execute = true;
      options.preview = false;
    } else if (arg === "--preview") {
      options.preview = true;
    } else if (arg === "--confirmation" && args[i + 1]) {
      options.confirmation = args[++i];
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options.execute) {
    const preview = await previewCleanup(options);
    console.log("--- HISTORICAL BIOMETRIC CLEANUP PREVIEW ---");
    console.log(`Device:                             ${preview.device}`);
    console.log(`Cutoff Date:                        ${preview.cutoffDate}`);
    console.log(`Biometric IDs Affected (${preview.biometricIdsAffected.length}):    ${preview.biometricIdsAffected.join(", ") || "None"}`);
    console.log(`Raw Punches Affected:               ${preview.rawPunchesAffected}`);
    console.log(`Exact Duplicates:                   ${preview.exactDuplicates}`);
    console.log(`First Punch Date:                   ${preview.firstPunchDate ?? "N/A"}`);
    console.log(`Last Punch Date:                    ${preview.lastPunchDate ?? "N/A"}`);
    console.log(`Unmatched Derived Attendance:       ${preview.unmatchedDerivedAttendance}`);
    console.log(`Unmatched Exceptions:               ${preview.unmatchedExceptions}`);
    console.log(`Matched Punches Protected:          ${preview.matchedPunchesProtected}`);
    console.log(`Current-Day Records Protected:      ${preview.currentDayRecordsProtected}`);
    console.log(`Payroll Records Protected:          ${preview.payrollRecordsProtected}`);
    console.log(`Employee Records Protected:         ${preview.employeeRecordsProtected}`);
    console.log("--------------------------------------------");
    console.log('[PREVIEW ONLY] Re-run with --execute --confirmation "CLEAR HISTORICAL DATA" to apply changes.');
  } else {
    const result = await executeCleanup(options);
    console.log("--- HISTORICAL BIOMETRIC CLEANUP EXECUTED ---");
    console.log(`Deleted Raw Punches:               ${result.deletedRawPunches}`);
    console.log(`Deleted Derived Attendance:        ${result.deletedAttendanceRecords}`);
    console.log(`Deleted Unmatched Exceptions:      ${result.deletedExceptions}`);
    console.log(`Audit Log Written:                 ${result.auditLogId}`);
    console.log("Transaction committed successfully.");
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", msg);
  process.exit(1);
});
