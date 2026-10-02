import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Attendee, AttendanceRecord, ParsedRecord, ParsedFileGroup, ACTIVITIES } from "../types";
import { isInvalidName, nameKey, REFERENCE_DATE } from "../utils";
import { isBlacklistedName } from "../blacklist";
import { UploadCloud, FileSpreadsheet, FileText, CheckCircle, AlertTriangle, Play, Sparkles, HelpCircle, Loader2, Trash2, MessageSquare, BookOpen, Music, PenTool, Calendar, Copy, Clock, ShieldOff, Files } from "lucide-react";
import confetti from "canvas-confetti";
import ReadOnlyNotice from "./ReadOnlyNotice";

interface DocumentParserProps {
  attendees: Attendee[];
  // Resolves to false when the server didn't save the import (US-27: nothing from the batch is kept)
  onImportData: (newAttendees: Omit<Attendee, "id">[], newRecords: Omit<AttendanceRecord, "id">[]) => Promise<boolean> | void;
  canEdit: boolean;
  onSignIn?: () => void;
}

const VALID_EXTENSIONS = [".txt", ".csv", ".docx", ".doc", ".xlsx", ".xls"];
// US-27: up to 20 .csv files of one activity per import; every other format stays one file at a time
const MAX_CSV_FILES = 20;

const extensionOf = (f: File) => f.name.substring(f.name.lastIndexOf(".")).toLowerCase();

// Same cleanup the server already ran (redundancy check): invalid/host names out, Title Case,
// one row per name+activity+date with "present" winning.
function cleanClientRecords(rawRecords: any[]): any[] {
  const cleaned: any[] = [];
  const seenKeys = new Set<string>();

  (rawRecords || []).forEach((rec: any) => {
    if (!rec || !rec.name) return;
    const nameStr = rec.name.trim();
    if (isInvalidName(nameStr)) return;

    const formattedName = nameStr
      .split(/\s+/)
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const key = `${formattedName.toLowerCase()}|${rec.activity.toLowerCase()}|${rec.date}`;
    if (seenKeys.has(key)) {
      const existing = cleaned.find(r =>
        r.name.toLowerCase() === formattedName.toLowerCase() &&
        r.activity.toLowerCase() === rec.activity.toLowerCase() &&
        r.date === rec.date
      );
      if (existing && rec.status === "present") existing.status = "present";
      return;
    }

    seenKeys.add(key);
    cleaned.push({ ...rec, name: formattedName });
  });

  return cleaned;
}

export default function DocumentParser({ attendees, onImportData, canEdit, onSignIn }: DocumentParserProps) {
  const [selectedImportLogActivity, setSelectedImportLogActivity] = useState<string>("Speakeasy");
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  // US-25/US-27: one entry per uploaded .csv (empty for other formats)
  const [fileGroups, setFileGroups] = useState<ParsedFileGroup[]>([]);
  const [expandedExclusions, setExpandedExclusions] = useState<Set<number>>(new Set());
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [batchDate, setBatchDate] = useState<string>(REFERENCE_DATE);
  // US-18: the parser found no valid session date in the file, so the user must pick one
  const [dateRequired, setDateRequired] = useState(false);
  const hasMissingDates = parsedRecords.some(rec => !rec.date);
  const isMultiFile = fileGroups.length > 1;
  const groupsWithoutDate = fileGroups.filter(g => !g.dateDetected).map(g => g.id);
  const hasPreview = parsedRecords.length > 0 || fileGroups.length > 0;

  const handleUpdateDate = (index: number, newDate: string) => {
    setParsedRecords(prev => prev.map((rec, idx) => idx === index ? { ...rec, date: newDate } : rec));
  };

  const handleUpdateGroupDate = (fileId: number, newDate: string) => {
    setParsedRecords(prev => prev.map(rec => (rec.fileId === fileId ? { ...rec, date: newDate } : rec)));
  };

  // In a multi-file batch, the batch date fills in the files that had no detectable date
  // (US-27); with a single file (or when every file had a date) it applies to all logs.
  const handleBatchUpdateDate = (newDate: string) => {
    if (!newDate) return;
    setBatchDate(newDate);
    const targets = isMultiFile && groupsWithoutDate.length > 0 ? new Set(groupsWithoutDate) : null;
    setParsedRecords(prev =>
      prev.map(rec => (!targets || targets.has(rec.fileId ?? -1) ? { ...rec, date: newDate } : rec))
    );
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading message sequences to keep the user engaged
  const loadingPhrases = [
    "Reading file bytes and extracting layout...",
    "Scanning rows for names, dates and attendance marks...",
    "Analyzing document semantics and isolating attendance logs...",
    "Matching names to the colleague directory...",
    "Normalizing session dates and activities...",
    "Formatting structured results..."
  ];

  const animateLoadingText = (index = 0) => {
    if (index >= loadingPhrases.length) return;
    setLoadingMessage(loadingPhrases[index]);
    setTimeout(() => {
      animateLoadingText(index + 1);
    }, 2000);
  };

  const resetPreview = () => {
    setParsedRecords([]);
    setFileGroups([]);
    setExpandedExclusions(new Set());
    setImportedCount(null);
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (canEdit && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFiles(Array.from(e.target.files));
    }
    e.target.value = ""; // allow re-selecting the same files after a rejection
  };

  const validateAndSetFiles = (selected: File[]) => {
    resetPreview();
    setFiles([]);

    if (selected.some(f => !VALID_EXTENSIONS.includes(extensionOf(f)))) {
      setErrorMsg(`Invalid file type. Please upload Excel (.xlsx, .xls), Word (.docx, .doc), or Text (.txt, .csv) files.`);
      return;
    }
    if (selected.length > 1) {
      // US-27: the whole selection is rejected, never trimmed to the first 20
      if (selected.length > MAX_CSV_FILES) {
        setErrorMsg(`You selected ${selected.length} files. The maximum is ${MAX_CSV_FILES} .csv files per import, so the whole selection was rejected.`);
        return;
      }
      if (selected.some(f => extensionOf(f) !== ".csv")) {
        setErrorMsg("Only .csv files can be selected together. Upload .xlsx, .xls, .docx, .doc and .txt files one at a time.");
        return;
      }
    }

    setFiles(selected);
    setErrorMsg("");
  };

  const handleUploadClick = () => {
    if (!canEdit) return;
    fileInputRef.current?.click();
  };

  // POST a multipart form and return its JSON, retrying while the server is still starting up
  const postForm = async (url: string, formData: FormData): Promise<any> => {
    let response: Response | null = null;
    const maxAttempts = 3;
    let lastFetchErr: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { method: "POST", body: formData });
        const contentType = res.headers.get("content-type") || "";

        // If response returned HTML during server startup or unexpected proxy state, retry if attempts remain
        if (!contentType.includes("application/json") && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        response = res;
        break;
      } catch (fErr: any) {
        lastFetchErr = fErr;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    if (!response) {
      throw new Error(
        lastFetchErr?.message
          ? `Connection issue: ${lastFetchErr.message}. Please verify the server is running and try uploading again.`
          : "Unable to establish a connection with the server. Please try again."
      );
    }

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let errorMsg = "Failed to parse document";
      if (contentType.includes("application/json")) {
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch (e) {}
      } else {
        try {
          const textData = await response.text();
          if (textData && textData.length < 500) {
            errorMsg = textData;
          }
        } catch (e) {}
      }
      throw new Error(errorMsg);
    }

    if (!contentType.includes("application/json")) {
      const textSnippet = await response.text();
      const cleanText = textSnippet.substring(0, 150);
      if (cleanText.toLowerCase().includes("<!doctype html") || cleanText.toLowerCase().includes("<html")) {
        throw new Error("The server was temporarily busy or updating. Please click 'Extract the Buzz' again.");
      }
      throw new Error(`Unexpected response from server: ${cleanText}`);
    }

    try {
      return await response.json();
    } catch (jsonErr) {
      throw new Error("Failed to read the server's response structure. The parser response was malformed.");
    }
  };

  const toPreviewRecord = (rec: any, fileId?: number): ParsedRecord => {
    // Simple case-insensitive name matcher
    const matched = attendees.find(att => att.name.toLowerCase() === rec.name.toLowerCase());
    return {
      ...rec,
      activity: selectedImportLogActivity, // Force activity to match selected activity log
      matchedAttendeeId: matched?.id,
      fileId,
    };
  };

  const handleParse = async () => {
    if (files.length === 0) return;

    setLoading(true);
    setErrorMsg("");
    resetPreview();
    animateLoadingText(0);

    // US-27: .csv uploads (1–20 files) go through the batch parser; other formats stay single-file
    const isCsvBatch = files.every(f => extensionOf(f) === ".csv");
    const formData = new FormData();
    if (isCsvBatch) {
      files.forEach(f => formData.append("files", f));
    } else {
      formData.append("file", files[0]);
    }
    formData.append("activity", selectedImportLogActivity);

    try {
      let processed: ParsedRecord[] = [];
      let groups: ParsedFileGroup[] = [];
      let missingDate = false;

      if (isCsvBatch) {
        const data = await postForm("/api/parse-attendance-batch", formData);
        (data.files || []).forEach((f: any, id: number) => {
          groups.push({
            id,
            filename: f.filename,
            dateDetected: f.dateDetected !== false,
            durationFilterApplied: Boolean(f.durationFilterApplied),
            excludedByDuration: f.excludedByDuration || [],
            excludedByBlacklist: f.excludedByBlacklist || 0,
            duplicateOf: f.duplicateOf ?? null,
          });
          if (!f.duplicateOf) {
            processed.push(...cleanClientRecords(f.records).map(rec => toPreviewRecord(rec, id)));
          }
        });
        missingDate = groups.some(g => !g.dateDetected && !g.duplicateOf) || processed.some(rec => !rec.date);
      } else {
        const data = await postForm("/api/parse-attendance-file", formData);
        processed = cleanClientRecords(data.records).map(rec => toPreviewRecord(rec));
        missingDate = data.dateDetected === false || processed.some(rec => !rec.date);
      }

      setParsedRecords(processed);
      setFileGroups(groups);
      setDateRequired(missingDate);
      if (missingDate) {
        setBatchDate("");
      } else if (processed.length > 0 && processed[0].date) {
        setBatchDate(processed[0].date);
      }

      if (processed.length > 0) {
        confetti({
          particleCount: 50,
          spread: 40,
          origin: { y: 0.6 }
        });
      } else if (groups.length === 0 || groups.every(g => g.excludedByDuration.length === 0)) {
        setFileGroups([]);
        setErrorMsg("We couldn't find any attendance records in this file. Check the Parsing Guidelines and try again.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while uploading and parsing the document.");
    } finally {
      setLoading(false);
    }
  };

  // Import the approved records into the master list
  const handleImportApproved = async () => {
    if (!canEdit || hasMissingDates || importing) return;
    const newAttendeesToCreate: Omit<Attendee, "id">[] = [];
    const newRecordsToSave: Omit<AttendanceRecord, "id">[] = [];

    // Keep track of names we will create so we don't duplicate within the same batch
    const createdNamesInBatch = new Set<string>();

    // US-27: files of the same date are one event, so a colleague listed in several of them is
    // logged once per date+activity ("present" wins over "absent").
    const consolidated = new Map<string, ParsedRecord>();
    // US-19: never consolidate blacklisted facilitators, even if they slipped into the preview
    parsedRecords.filter(rec => !isBlacklistedName(rec.name)).forEach(rec => {
      const key = `${nameKey(rec.name)}|${rec.date}|${rec.activity}`;
      const existing = consolidated.get(key);
      if (!existing) consolidated.set(key, rec);
      else if (rec.status === "present") consolidated.set(key, { ...existing, status: "present" });
    });

    // US-24: a new colleague joins on their earliest date in the batch, whatever the row order
    // (YYYY-MM-DD compares as a string). Informative only: since US-31 it doesn't affect the Bee-havior Hub.
    const earliestDate = new Map<string, string>();
    consolidated.forEach(rec => {
      const key = nameKey(rec.name);
      const current = earliestDate.get(key);
      if (current === undefined || rec.date < current) earliestDate.set(key, rec.date);
    });

    consolidated.forEach(rec => {
      let attendeeId = rec.matchedAttendeeId;

      if (!attendeeId) {
        // Check if we've already designated this colleague for creation in this batch
        const trimmedName = rec.name.trim();
        const existingInMaster = attendees.find(
          a => a.name.toLowerCase() === trimmedName.toLowerCase()
        );

        if (existingInMaster) {
          attendeeId = existingInMaster.id;
        } else {
          // Check if already in batch
          if (!createdNamesInBatch.has(trimmedName.toLowerCase())) {
            newAttendeesToCreate.push({
              name: rec.name,
              enrolledActivities: [rec.activity],
              joinedDate: earliestDate.get(nameKey(trimmedName)) ?? rec.date,
            });
            createdNamesInBatch.add(trimmedName.toLowerCase());
          }
        }
      }

      // Record logs
      newRecordsToSave.push({
        attendeeId: attendeeId || "", // Will be wired up by App.tsx during state updates
        attendeeName: rec.name,
        activity: rec.activity,
        date: rec.date,
        status: rec.status,
      });
    });

    setImporting(true);
    const saved = await onImportData(newAttendeesToCreate, newRecordsToSave);
    setImporting(false);

    // US-27: the server saves the whole batch or none of it; keep the preview so it can be retried
    if (saved === false) {
      setErrorMsg("Import failed: nothing from this batch was saved. Check that you're signed in and the server is running, then try again.");
      return;
    }

    // Blast celebration confetti!
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.8 }
    });

    setErrorMsg("");
    resetPreview();
    setImportedCount(newRecordsToSave.length);
    setFiles([]);
  };

  const handleDeleteRecord = (indexToDelete: number) => {
    setParsedRecords((prev) => prev.filter((_, i) => i !== indexToDelete));
  };

  const toggleExclusions = (groupId: number) => {
    setExpandedExclusions(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderRecordsTable = (rows: { rec: ParsedRecord; index: number }[]) => (
    <div className="border border-natural-border rounded-[24px] overflow-hidden shadow-inner">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-natural-cream/40 text-natural-sage text-xs font-bold uppercase border-b border-natural-border">
            <th className="p-4">Colleague Name</th>
            <th className="p-4">Assigned Activity</th>
            <th className="p-4">Date</th>
            <th className="p-4">Status</th>
            <th className="p-4">Roster Status</th>
            <th className="p-4 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-natural-border/60 text-sm text-natural-forest">
          {rows.map(({ rec, index: i }) => {
            const isNew = !rec.matchedAttendeeId;
            return (
              <tr key={i} className="hover:bg-natural-cream/10 transition">
                <td className="p-4 font-bold text-[#1A1A1A]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{rec.name}</span>
                    {rec.needsReview && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-300"
                        title={rec.reviewReason}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Needs review
                      </span>
                    )}
                  </div>
                  {rec.needsReview && rec.reviewReason && (
                    <p className="text-[11px] font-medium text-amber-700 mt-1">{rec.reviewReason}</p>
                  )}
                </td>
                <td className="p-4">
                  <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-natural-cream text-natural-forest border border-natural-border/30">
                    {rec.activity}
                  </span>
                </td>
                <td className="p-4">
                  <input
                    type="date"
                    value={rec.date}
                    onChange={(e) => handleUpdateDate(i, e.target.value)}
                    className="bg-white border border-natural-border rounded-lg px-2 py-1 text-natural-forest text-xs font-medium focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage font-mono"
                  />
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      rec.status === "present"
                        ? "bg-[#CCD5AE]/40 text-natural-forest border border-[#CCD5AE]/80"
                        : "bg-natural-sand/15 text-natural-sand border border-natural-sand/35"
                    }`}
                  >
                    {rec.status === "present" ? "Present" : "Absent"}
                  </span>
                </td>
                <td className="p-4">
                  {isNew ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-natural-wheat text-natural-forest px-2 py-1 rounded-md border border-natural-border/60">
                      <Sparkles className="h-3 w-3 text-natural-sand" />
                      New Colleague (Registered)
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-natural-sage">
                       Existing Colleague Linked
                    </span>
                  )}
                </td>
                <td className="p-4 text-center">
                  <button
                    type="button"
                    onClick={() => handleDeleteRecord(i)}
                    className="p-1.5 text-natural-sand/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // US-25/US-27: one card per uploaded .csv with its summary, followed by that file's records
  const renderFileGroup = (group: ParsedFileGroup) => {
    const rows = parsedRecords
      .map((rec, index) => ({ rec, index }))
      .filter(({ rec }) => rec.fileId === group.id);
    const groupDate = rows[0]?.rec.date ?? "";
    const sameDateFiles = groupDate
      ? fileGroups.filter(
          g => g.id !== group.id && !g.duplicateOf && parsedRecords.some(r => r.fileId === g.id && r.date === groupDate)
        )
      : [];
    const excludedCount = group.excludedByDuration.length;
    const showExcluded = expandedExclusions.has(group.id);

    return (
      <div key={group.id} className="space-y-3" data-testid="file-group">
        <div
          className={`rounded-2xl border p-4 space-y-3 ${
            group.duplicateOf ? "bg-natural-cream/20 border-natural-border/60 opacity-80" : "bg-natural-wheat/10 border-natural-border"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-natural-sage shrink-0" />
              <h4 className="font-serif font-bold text-[#1A1A1A] text-sm truncate" title={group.filename}>
                {group.filename}
              </h4>
            </div>
            {!group.duplicateOf && (
              <label className="flex items-center gap-2 text-xs font-semibold text-natural-forest">
                <Calendar className="h-4 w-4 text-natural-sage" />
                Session date
                <input
                  type="date"
                  value={groupDate}
                  onChange={(e) => handleUpdateGroupDate(group.id, e.target.value)}
                  className={`bg-white border rounded-lg px-2 py-1 text-natural-forest text-xs font-medium font-mono focus:outline-none focus:ring-2 focus:ring-natural-sage/20 ${
                    groupDate ? "border-natural-border" : "border-natural-sand"
                  }`}
                />
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-natural-border/60 text-natural-forest">
              {rows.length} attendees
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-natural-border/60 text-natural-forest">
              <ShieldOff className="h-3 w-3 text-natural-sage" />
              {group.excludedByBlacklist} excluded by blacklist
            </span>
            {group.durationFilterApplied ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-natural-border/60 text-natural-forest">
                <Clock className="h-3 w-3 text-natural-sage" />
                {excludedCount} attendees excluded (less than 10 minutes)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-700" role="note">
                <AlertTriangle className="h-3 w-3" />
                Duration filter not applied: this file has no duration column
              </span>
            )}
            {group.duplicateOf ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-natural-sand/15 border border-natural-sand/40 text-natural-sand">
                <Copy className="h-3 w-3" />
                Duplicate of {group.duplicateOf} (excluded)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#CCD5AE]/30 border border-[#CCD5AE]/80 text-natural-forest">
                <CheckCircle className="h-3 w-3" />
                Not a duplicate
              </span>
            )}
            {group.durationFilterApplied && excludedCount > 0 && (
              <button
                type="button"
                onClick={() => toggleExclusions(group.id)}
                className="px-2.5 py-1 rounded-full text-natural-forest underline underline-offset-2 hover:bg-natural-cream"
              >
                {showExcluded ? "Hide excluded" : "View excluded"}
              </button>
            )}
          </div>

          {showExcluded && excludedCount > 0 && (
            <ul className="bg-white border border-natural-border/60 rounded-xl divide-y divide-natural-border/40 text-xs" aria-label="Excluded attendees">
              {group.excludedByDuration.map(ex => (
                <li key={ex.name} className="flex justify-between gap-4 px-3 py-2">
                  <span className="font-semibold text-[#1A1A1A]">{ex.name}</span>
                  <span className="font-mono text-natural-sage">{ex.duration}</span>
                </li>
              ))}
            </ul>
          )}

          {sameDateFiles.length > 0 && (
            <p className="text-xs text-natural-sage font-medium">
              Same date as {sameDateFiles.map(g => g.filename).join(", ")}: their attendees will be merged into one event.
            </p>
          )}
        </div>

        {!group.duplicateOf && rows.length > 0 && renderRecordsTable(rows)}
      </div>
    );
  };

  const fileCount = fileGroups.filter(g => !g.duplicateOf).length;

  return (
    <div className="bg-white rounded-[32px] border border-natural-border p-8 shadow-sm space-y-8 animate-fade-in" id="smart-parser-tab">
      {/* Header */}
      <div className="border-b border-natural-border pb-6">
        <h2 className="text-2xl font-serif font-bold text-[#1A1A1A] flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-natural-sage" />
          Smart Document Parser
        </h2>
        <p className="text-sm text-natural-sage mt-1 font-medium">
          Upload class logs, Word docs, spreadsheets or text lists and we'll compile them into unified database records!
        </p>
      </div>

      {/* Activity-specific Import Log tabs */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">
          Select Activity Import Log
        </label>
        <div className="bg-natural-wheat/10 border border-natural-border p-2 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-2">
          {ACTIVITIES.map((act) => {
            let Icon = MessageSquare;
            if (act === "Reading Club") Icon = BookOpen;
            else if (act === "Music Room") Icon = Music;
            else if (act === "Writing Hood") Icon = PenTool;

            const isActive = selectedImportLogActivity === act;
            return (
              <button
                key={act}
                type="button"
                onClick={() => {
                  setSelectedImportLogActivity(act);
                  resetPreview();
                  setFiles([]);
                  setErrorMsg("");
                }}
                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-bold transition duration-150 ${
                  isActive
                    ? "bg-natural-forest text-white shadow-md shadow-natural-forest/10 scale-[1.01]"
                    : "bg-white hover:bg-natural-cream text-natural-forest border border-natural-border/40"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-natural-sage"}`} />
                <span>{act} Log</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-natural-sage/95 italic font-medium">
          * Currently displaying the <strong>{selectedImportLogActivity}</strong> Import Log. Any uploaded files will record attendance directly under this activity.
        </p>
      </div>

      {!canEdit && <ReadOnlyNotice onSignIn={onSignIn} />}

      {importedCount !== null && (
        <div className="bg-[#CCD5AE]/20 border border-[#CCD5AE]/60 text-natural-forest px-6 py-4 rounded-xl flex items-center gap-4 animate-bounce-subtle">
          <CheckCircle className="h-8 w-8 text-natural-sage shrink-0" />
          <div>
            <h4 className="font-serif font-bold text-natural-forest text-base">Import Successful!</h4>
            <p className="text-sm text-natural-forest/80 mt-0.5 font-medium">
              Successfully registered {importedCount} new attendance logs and registered any new colleagues.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-natural-sand/10 border border-natural-sand/30 text-natural-sand px-4 py-3 rounded-xl text-sm flex items-start gap-2.5" role="alert">
          <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Drag & Drop Zone */}
      {!loading && !hasPreview && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              aria-disabled={!canEdit}
              className={`border-2 border-dashed rounded-[24px] p-10 text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[300px] ${
                !canEdit
                  ? "border-natural-border opacity-50 cursor-not-allowed"
                  : dragActive
                  ? "border-natural-sage bg-natural-cream/30 scale-[0.99]"
                  : "border-natural-border hover:border-natural-sage hover:bg-natural-cream/10 cursor-pointer"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                accept=".txt,.csv,.docx,.doc,.xlsx,.xls"
                className="hidden"
              />

              <div className="p-4 bg-natural-cream text-natural-sage rounded-2xl border border-natural-border/30 mb-4 animate-pulse-slow">
                {files.length > 1 ? <Files className="h-10 w-10" /> : <UploadCloud className="h-10 w-10" />}
              </div>

              {files.length === 1 ? (
                <div className="space-y-1">
                  <p className="font-serif font-bold text-[#1A1A1A] text-base">{files[0].name}</p>
                  <p className="text-xs text-natural-sage font-semibold">
                    {(files[0].size / 1024).toFixed(1)} KB • Ready to compile
                  </p>
                </div>
              ) : files.length > 1 ? (
                <div className="space-y-1">
                  <p className="font-serif font-bold text-[#1A1A1A] text-base">{files.length} .csv files selected</p>
                  <p className="text-xs text-natural-sage font-semibold max-w-md mx-auto break-words">
                    {files.map(f => f.name).join(", ")} • Ready to compile
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-serif font-bold text-[#1A1A1A] text-base">
                    Drag and drop your attendance file here
                  </p>
                  <p className="text-sm text-natural-sage max-w-sm mx-auto font-medium">
                    Supports Excel spreadsheets, Word text logs, and plaintext CSVs. Select up to {MAX_CSV_FILES} .csv files of the same activity at once.
                  </p>
                  <span className="inline-block mt-4 text-xs font-bold text-natural-forest bg-natural-wheat border border-natural-border/40 px-3.5 py-1.5 rounded-lg hover:bg-natural-wheat/80 transition shadow-sm">
                    Browse Files
                  </span>
                </div>
              )}
            </div>

            {files.length > 0 && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!canEdit}
                  className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold px-6 py-3 rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Extract the Buzz</span>
                </button>
              </div>
            )}
          </div>

          {/* Guide / How-To Panel */}
          <div className="bg-natural-cream/30 rounded-[32px] p-6 border border-natural-border flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="font-bold text-natural-forest text-xs uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-natural-sage" />
                Parsing Guidelines
              </h4>
              <p className="text-xs text-natural-sage leading-relaxed font-medium">
                Our built-in parser reads most attendance layouts. For best results, make sure your files contain:
              </p>

              <ul className="space-y-3 text-xs text-natural-forest">
                <li className="flex items-start gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-natural-sage shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#1A1A1A]">Spreadsheets:</strong> Row columns with colleague names, dates, and presence indicators (Present, Absent, P, A, 1, 0).
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-natural-forest shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#1A1A1A]">Word/Text Logs:</strong> Formatted lines like "John Doe - Speakeasy - June 10 - Present" or standard CSV rosters.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-natural-sage shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#1A1A1A]">CSV meeting reports:</strong> Attendees with less than 10 minutes in the "Duration" / "In-Meeting Duration" column are left out.
                  </div>
                </li>
              </ul>

              <div className="bg-white p-4 rounded-xl border border-natural-border/60 mt-4">
                <p className="text-[10px] font-bold text-natural-sage uppercase tracking-widest">Example Document:</p>
                <p className="text-[11px] text-natural-forest font-mono mt-1 whitespace-pre leading-normal font-medium">
                  Date: June 15, 2026<br/>
                  Activity: Music Room<br/>
                  - Elena Rostova (Present)<br/>
                  - Carlos Gomez (Absent)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Animation Card */}
      {loading && (
        <div className="border border-natural-border rounded-[24px] p-12 text-center bg-natural-cream/20 space-y-6 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="h-10 w-10 text-natural-sage animate-spin" />
          <div className="space-y-1.5">
            <h4 className="font-serif font-bold text-natural-forest text-lg">Compiling File Data...</h4>
            <p className="text-sm text-natural-sage font-medium max-w-md mx-auto h-12 flex items-center justify-center">
              {loadingMessage}
            </p>
          </div>
        </div>
      )}

      {/* Parsing Preview Pane */}
      {hasPreview && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-natural-border pb-4">
            <div>
              <h3 className="font-serif font-bold text-[#1A1A1A] text-lg">Review Extracted Records</h3>
              <p className="text-xs text-natural-sage font-medium">
                {isMultiFile
                  ? `Found ${parsedRecords.length} records across ${fileCount} files. New colleagues will be registered in the directory.`
                  : `Found ${parsedRecords.length} records. New colleagues will be registered in the directory.`}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetPreview}
                className="px-4 py-2 border border-natural-border text-natural-forest/70 hover:bg-natural-cream text-sm font-semibold rounded-xl transition"
              >
                Discard
              </button>

              <button
                type="button"
                onClick={handleImportApproved}
                disabled={!canEdit || hasMissingDates || importing || parsedRecords.length === 0}
                title={hasMissingDates ? "Select a session date in Batch Edit Session Date first" : undefined}
                className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold px-5 py-2 rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                <span>Confirm & Import Caserits</span>
              </button>
            </div>
          </div>

          {/* Batch Edit Date Section */}
          <div
            id="batch-edit-session-date"
            className={`p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              hasMissingDates ? "bg-natural-sand/10 border-2 border-natural-sand/60" : "bg-natural-wheat/15 border border-[#CCD5AE]/30"
            }`}
          >
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-natural-forest flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-natural-sage" />
                Batch Edit Session Date
              </h4>
              <p className="text-xs text-natural-sage font-medium">
                {isMultiFile && groupsWithoutDate.length > 0
                  ? "Set the date for the files that had no detectable session date. Each file keeps its own date otherwise."
                  : "Change the date for all listed logs simultaneously."}
              </p>
              {hasMissingDates && (
                <p className="text-xs text-natural-sand font-bold flex items-center gap-1.5" role="alert">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {isMultiFile && groupsWithoutDate.length > 0
                    ? `No valid session date was found in: ${fileGroups.filter(g => !g.dateDetected).map(g => g.filename).join(", ")}. Select the session date and click "Apply to Files Without Date" before importing.`
                    : dateRequired
                    ? "No valid session date was found in this file. Select the session date and click \"Apply to All Logs\" before importing."
                    : "Some logs have no date. Select the session date and click \"Apply to All Logs\" before importing."}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                className="bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-forest text-xs font-medium focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage"
              />
              <button
                type="button"
                onClick={() => handleBatchUpdateDate(batchDate)}
                disabled={!batchDate}
                className="disabled:opacity-50 disabled:cursor-not-allowed bg-natural-forest hover:bg-[#213028] text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm font-serif"
              >
                {isMultiFile && groupsWithoutDate.length > 0 ? "Apply to Files Without Date" : "Apply to All Logs"}
              </button>
            </div>
          </div>

          {fileGroups.length > 0
            ? fileGroups.map(renderFileGroup)
            : renderRecordsTable(parsedRecords.map((rec, index) => ({ rec, index })))}
        </div>
      )}
    </div>
  );
}
