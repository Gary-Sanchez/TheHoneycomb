// US-38: .csv batch limits, shared by the Import Forage Logs UI and POST /api/parse-attendance-batch
// so the API can't be used to get around them. Every other format is still uploaded one at a time.

export const MAX_CSV_BATCH_FILES = 50;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // per file (unchanged)
export const MAX_CSV_BATCH_BYTES = 50 * 1024 * 1024; // the whole batch

const MB = 1024 * 1024;

export const tooManyFilesMessage = (count?: number) =>
  `${count ? `You selected ${count} files. ` : ""}The maximum is ${MAX_CSV_BATCH_FILES} .csv files per import, so the whole batch was rejected. Select fewer files and try again.`;

export const batchTooLargeMessage = (bytes?: number) =>
  `${bytes ? `The selected files add up to ${(bytes / MB).toFixed(1)} MB. ` : ""}The maximum is ${
    MAX_CSV_BATCH_BYTES / MB
  } MB for all files together, so the whole batch was rejected. Split it into smaller batches and try again.`;

// The first limit a selection breaks, as a message for the user, or null when it fits
export function checkCsvBatch(files: { size: number }[]): string | null {
  if (files.length > MAX_CSV_BATCH_FILES) return tooManyFilesMessage(files.length);
  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  if (bytes > MAX_CSV_BATCH_BYTES) return batchTooLargeMessage(bytes);
  return null;
}
