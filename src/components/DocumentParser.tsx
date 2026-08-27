import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Attendee, AttendanceRecord, ParsedRecord, ACTIVITIES } from "../types";
import { isInvalidName } from "../utils";
import { UploadCloud, FileSpreadsheet, FileText, CheckCircle, AlertTriangle, Play, Sparkles, HelpCircle, Loader2, Trash2, MessageSquare, BookOpen, Music, PenTool, Calendar } from "lucide-react";
import confetti from "canvas-confetti";

interface DocumentParserProps {
  attendees: Attendee[];
  onImportData: (newAttendees: Omit<Attendee, "id">[], newRecords: Omit<AttendanceRecord, "id">[]) => void;
}

export default function DocumentParser({ attendees, onImportData }: DocumentParserProps) {
  const [selectedImportLogActivity, setSelectedImportLogActivity] = useState<string>("Speakeasy");
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [batchDate, setBatchDate] = useState<string>("2026-06-24");
  
  const handleUpdateDate = (index: number, newDate: string) => {
    setParsedRecords(prev => prev.map((rec, idx) => idx === index ? { ...rec, date: newDate } : rec));
  };

  const handleBatchUpdateDate = (newDate: string) => {
    if (!newDate) return;
    setBatchDate(newDate);
    setParsedRecords(prev => prev.map(rec => ({ ...rec, date: newDate })));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading message sequences to keep the user engaged
  const loadingPhrases = [
    "Reading file bytes and extracting layout...",
    "Sending content safely to Gemini 3.5 Flash...",
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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const validExtensions = [".txt", ".csv", ".docx", ".doc", ".xlsx", ".xls"];
    const extension = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();
    
    if (validExtensions.includes(extension)) {
      setFile(selectedFile);
      setErrorMsg("");
      setParsedRecords([]);
      setImportedCount(null);
      setFallbackUsed(false);
    } else {
      setErrorMsg(`Invalid file type. Please upload Excel (.xlsx, .xls), Word (.docx, .doc), or Text (.txt, .csv) files.`);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleParse = async () => {
    if (!file) return;

    setLoading(true);
    setErrorMsg("");
    setParsedRecords([]);
    setImportedCount(null);
    setFallbackUsed(false);
    animateLoadingText(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("activity", selectedImportLogActivity);

    try {
      let response: Response | null = null;
      let maxAttempts = 3;
      let lastFetchErr: any = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await fetch("/api/parse-attendance-file", {
            method: "POST",
            body: formData,
          });

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
      let data: any = null;

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
          throw new Error("The server was temporarily busy or updating. Please click 'Parse & Analyze Document' again.");
        }
        throw new Error(`Unexpected response from server: ${cleanText}`);
      }

      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error("Failed to read the server's response structure. The parser response was malformed.");
      }
      
      const cleanedClientRecords: any[] = [];
      const clientSeenKeys = new Set<string>();

      (data.records || []).forEach((rec: any) => {
        if (!rec || !rec.name) return;
        const nameStr = rec.name.trim();
        const nameLower = nameStr.toLowerCase();

        // Apply our robust validation
        if (isInvalidName(nameStr)) {
          return;
        }

        // Format nicely to Title Case (redundancy check)
        const formattedName = nameStr
          .split(/\s+/)
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");

        const key = `${formattedName.toLowerCase()}|${rec.activity.toLowerCase()}|${rec.date}`;
        if (clientSeenKeys.has(key)) {
          const existingIdx = cleanedClientRecords.findIndex(r => 
            r.name.toLowerCase() === formattedName.toLowerCase() && 
            r.activity.toLowerCase() === rec.activity.toLowerCase() && 
            r.date === rec.date
          );
          if (existingIdx !== -1 && rec.status === "present") {
            cleanedClientRecords[existingIdx].status = "present";
          }
          return;
        }

        clientSeenKeys.add(key);
        cleanedClientRecords.push({
          ...rec,
          name: formattedName
        });
      });

      // Post-process the parsed records from Gemini to link to existing attendees
      const processed: ParsedRecord[] = cleanedClientRecords.map((rec: any) => {
        // Simple case-insensitive name matcher
        const matched = attendees.find(
          att => att.name.toLowerCase() === rec.name.toLowerCase()
        );
        return {
          ...rec,
          activity: selectedImportLogActivity, // Force activity to match selected activity log
          matchedAttendeeId: matched?.id,
        };
      });

      setParsedRecords(processed);
      if (processed.length > 0 && processed[0].date) {
        setBatchDate(processed[0].date);
      }
      setFallbackUsed(!!data.fallbackUsed);
      
      if (processed.length > 0) {
        confetti({
          particleCount: 50,
          spread: 40,
          origin: { y: 0.6 }
        });
      } else {
        setErrorMsg("Gemini completed parsing but found no structured attendance records in the file.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while uploading and parsing the document.");
    } finally {
      setLoading(false);
    }
  };

  // Import the approved records into the master list
  const handleImportApproved = () => {
    const newAttendeesToCreate: Omit<Attendee, "id">[] = [];
    const newRecordsToSave: Omit<AttendanceRecord, "id">[] = [];

    // Keep track of names we will create so we don't duplicate within the same batch
    const createdNamesInBatch = new Set<string>();

    parsedRecords.forEach(rec => {
      let attendeeId = rec.matchedAttendeeId;

      if (!attendeeId) {
        // Check if we've already designated this colleague for creation in this batch
        const nameKey = rec.name.trim();
        const existingInMaster = attendees.find(
          a => a.name.toLowerCase() === nameKey.toLowerCase()
        );

        if (existingInMaster) {
          attendeeId = existingInMaster.id;
        } else {
          // Check if already in batch
          if (!createdNamesInBatch.has(nameKey.toLowerCase())) {
            newAttendeesToCreate.push({
              name: rec.name,
              enrolledActivities: [rec.activity],
              joinedDate: rec.date,
            });
            createdNamesInBatch.add(nameKey.toLowerCase());
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

    onImportData(newAttendeesToCreate, newRecordsToSave);

    // Blast celebration confetti!
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.8 }
    });

    setImportedCount(parsedRecords.length);
    setParsedRecords([]);
    setFile(null);
  };

  const handleDeleteRecord = (indexToDelete: number) => {
    setParsedRecords((prev) => prev.filter((_, i) => i !== indexToDelete));
  };

  return (
    <div className="bg-white rounded-[32px] border border-natural-border p-8 shadow-sm space-y-8 animate-fade-in" id="smart-parser-tab">
      {/* Header */}
      <div className="border-b border-natural-border pb-6">
        <h2 className="text-2xl font-serif font-bold text-[#1A1A1A] flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-natural-sage" />
          Smart Document Parser
        </h2>
        <p className="text-sm text-natural-sage mt-1 font-medium">
          Upload unstructured class logs, Word docs, spreadsheets or text lists. Gemini AI compiles them into unified database records!
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
                  setParsedRecords([]);
                  setFile(null);
                  setErrorMsg("");
                  setImportedCount(null);
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
        <div className="bg-natural-sand/10 border border-natural-sand/30 text-natural-sand px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Drag & Drop Zone */}
      {!loading && parsedRecords.length === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              className={`border-2 border-dashed rounded-[24px] p-10 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[300px] ${
                dragActive
                  ? "border-natural-sage bg-natural-cream/30 scale-[0.99]"
                  : "border-natural-border hover:border-natural-sage hover:bg-natural-cream/10"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept=".txt,.csv,.docx,.doc,.xlsx,.xls"
                className="hidden"
              />
              
              <div className="p-4 bg-natural-cream text-natural-sage rounded-2xl border border-natural-border/30 mb-4 animate-pulse-slow">
                <UploadCloud className="h-10 w-10" />
              </div>

              {file ? (
                <div className="space-y-1">
                  <p className="font-serif font-bold text-[#1A1A1A] text-base">{file.name}</p>
                  <p className="text-xs text-natural-sage font-semibold">
                    {(file.size / 1024).toFixed(1)} KB • Ready to compile
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-serif font-bold text-[#1A1A1A] text-base">
                    Drag and drop your attendance file here
                  </p>
                  <p className="text-sm text-natural-sage max-w-sm mx-auto font-medium">
                    Supports Excel spreadsheets, Word text logs, and plaintext CSVs
                  </p>
                  <span className="inline-block mt-4 text-xs font-bold text-natural-forest bg-natural-wheat border border-natural-border/40 px-3.5 py-1.5 rounded-lg hover:bg-natural-wheat/80 transition shadow-sm">
                    Browse Files
                  </span>
                </div>
              )}
            </div>

            {file && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleParse}
                  className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold px-6 py-3 rounded-xl shadow-md transition"
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
                Gemini is intelligent and handles almost any formatting. To get the best results, ensure your files contain:
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
      {parsedRecords.length > 0 && (
        <div className="space-y-6 animate-fade-in">
          {fallbackUsed && (
            <div className="bg-[#E9E5D9] border border-natural-border text-natural-forest px-4 py-3 rounded-2xl text-xs flex items-center gap-3 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 animate-pulse" />
              <span>
                <strong>Offline Backup Active:</strong> The AI parser is currently experiencing high request volumes or temporary spikes. We’ve parsed your document using our offline deterministic engine so you can continue working without delay!
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-natural-border pb-4">
            <div>
              <h3 className="font-serif font-bold text-[#1A1A1A] text-lg">Review Extracted Records</h3>
              <p className="text-xs text-natural-sage font-medium">
                Found {parsedRecords.length} records. New colleagues will be registered in the directory.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setParsedRecords([])}
                className="px-4 py-2 border border-natural-border text-natural-forest/70 hover:bg-natural-cream text-sm font-semibold rounded-xl transition"
              >
                Discard
              </button>
              
              <button
                type="button"
                onClick={handleImportApproved}
                className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold px-5 py-2 rounded-xl text-sm transition"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Confirm & Import Caserits</span>
              </button>
            </div>
          </div>

          {/* Batch Edit Date Section */}
          <div className="bg-natural-wheat/15 border border-[#CCD5AE]/30 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-natural-forest flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-natural-sage" />
                Batch Edit Session Date
              </h4>
              <p className="text-xs text-natural-sage font-medium">
                Change the date for all listed logs simultaneously.
              </p>
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
                className="bg-natural-forest hover:bg-[#213028] text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm font-serif"
              >
                Apply to All Logs
              </button>
            </div>
          </div>

          {/* Table */}
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
                {parsedRecords.map((rec, i) => {
                  const isNew = !rec.matchedAttendeeId;
                  return (
                    <tr key={i} className="hover:bg-natural-cream/10 transition">
                      <td className="p-4 font-bold text-[#1A1A1A]">{rec.name}</td>
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
        </div>
      )}
    </div>
  );
}
