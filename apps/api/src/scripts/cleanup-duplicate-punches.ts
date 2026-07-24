import {
  executeDuplicateCleanup,
  previewDuplicateCleanup,
  type DuplicateCleanupOptions,
} from "../modules/maintenance/cleanup-duplicate-punches.service.js";

function parseArgs(args: string[]): DuplicateCleanupOptions {
  const options: DuplicateCleanupOptions = {
    execute: false,
    preview: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--device-code" && args[i + 1]) {
      options.deviceCode = args[++i];
    } else if (arg === "--before" && args[i + 1]) {
      options.before = args[++i];
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
    const preview = await previewDuplicateCleanup(options);
    console.log("--- EXACT DUPLICATE PUNCH CLEANUP PREVIEW ---");
    console.log(`Device:                             ${preview.device}`);
    console.log(`Cutoff Date:                        ${preview.cutoffDate ?? "NONE"}`);
    console.log(`Duplicate Groups:                   ${preview.duplicateGroups}`);
    console.log(`Total Duplicate Rows:               ${preview.totalDuplicateRows}`);
    console.log(`Records Preserved:                  ${preview.recordsPreserved}`);
    console.log(`Records Removed:                    ${preview.recordsRemoved}`);
    console.log(`Affected Biometric IDs (${preview.affectedBiometricIds.length}):    ${preview.affectedBiometricIds.join(", ") || "None"}`);
    console.log(`Earliest Timestamp:                 ${preview.earliestTimestamp ?? "N/A"}`);
    console.log(`Latest Timestamp:                   ${preview.latestTimestamp ?? "N/A"}`);
    console.log(`Matched Attendance Protected:       ${preview.matchedAttendanceProtected}`);
    console.log("----------------------------------------------");
    console.log('[PREVIEW ONLY] Re-run with --execute --confirmation "REMOVE EXACT DUPLICATES" to apply changes.');
  } else {
    const result = await executeDuplicateCleanup(options);
    console.log("--- EXACT DUPLICATE PUNCH CLEANUP EXECUTED ---");
    console.log(`Duplicate Groups Processed:        ${result.duplicateGroupsCount}`);
    console.log(`Deleted Duplicate Rows:            ${result.deletedDuplicateRows}`);
    console.log(`Preserved Canonical Records:       ${result.preservedCanonicalRecords}`);
    console.log(`Audit Log Written:                 ${result.auditLogId}`);
    console.log("Transaction committed successfully.");
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", msg);
  process.exit(1);
});
