import { useState, useEffect } from "react";
import { Attendee, AttendanceRecord } from "./types";
import { initialAttendees, initialAttendanceRecords } from "./mockData";
import { isInvalidName } from "./utils";
import DashboardStats from "./components/DashboardStats";
import AttendanceLogger from "./components/AttendanceLogger";
import AttendeeDirectory from "./components/AttendeeDirectory";
import CrossReferenceHub from "./components/CrossReferenceHub";
import DocumentParser from "./components/DocumentParser";
import ProgressReportModal from "./components/ProgressReportModal";
import { GraduationCap, LayoutDashboard, CheckSquare, Users, GitCompare, FileUp, RefreshCw, Clock } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Active colleague modal for viewing report
  const [activeReportAttendee, setActiveReportAttendee] = useState<Attendee | null>(null);

  // Load from LocalStorage or seed defaults on mount
  useEffect(() => {
    let cachedAttendees = localStorage.getItem("english_tracker_attendees");
    let cachedRecords = localStorage.getItem("english_tracker_records");
    const cachedNotes = localStorage.getItem("english_tracker_notes");

    // Detect if cache is stale (contains old activity names like "Speaking Club")
    const isStale = (cachedAttendees && cachedAttendees.includes("Speaking Club")) || 
                    (cachedRecords && cachedRecords.includes("Speaking Club"));

    if (isStale) {
      localStorage.removeItem("english_tracker_attendees");
      localStorage.removeItem("english_tracker_records");
      cachedAttendees = null;
      cachedRecords = null;
    }

    let parsedAttendees: Attendee[] = [];
    if (cachedAttendees) {
      parsedAttendees = JSON.parse(cachedAttendees);
    } else {
      parsedAttendees = initialAttendees;
    }

    let parsedRecords: AttendanceRecord[] = [];
    if (cachedRecords) {
      parsedRecords = JSON.parse(cachedRecords);
    } else {
      parsedRecords = initialAttendanceRecords;
    }

    // SYSTEMATICALLY FILTER OUT EXCLUDED NAMES & METADATA FROM LOADED STATE
    // This cleans up any dirty cache retroactively!
    const filteredAttendees = parsedAttendees.filter(att => !isInvalidName(att.name));
    const validAttendeeIds = new Set(filteredAttendees.map(att => att.id));
    
    const filteredRecords = parsedRecords.filter(rec => 
      !isInvalidName(rec.attendeeName) && 
      validAttendeeIds.has(rec.attendeeId)
    );

    setAttendees(filteredAttendees);
    setRecords(filteredRecords);
    localStorage.setItem("english_tracker_attendees", JSON.stringify(filteredAttendees));
    localStorage.setItem("english_tracker_records", JSON.stringify(filteredRecords));

    if (cachedNotes) {
      setNotes(JSON.parse(cachedNotes));
    } else {
      setNotes({});
    }
  }, []);

  // Sync state changes to LocalStorage
  const saveAttendeesToLocal = (updated: Attendee[]) => {
    setAttendees(updated);
    localStorage.setItem("english_tracker_attendees", JSON.stringify(updated));
  };

  const saveRecordsToLocal = (updated: AttendanceRecord[]) => {
    setRecords(updated);
    localStorage.setItem("english_tracker_records", JSON.stringify(updated));
  };

  const saveNotesToLocal = (updated: Record<string, string>) => {
    setNotes(updated);
    localStorage.setItem("english_tracker_notes", JSON.stringify(updated));
  };

  // 1. Quick add a colleague
  const handleAddAttendee = (name: string, email: string, enrolledActivities: string[]): Attendee => {
    const newAttendee: Attendee = {
      id: `att-${Date.now()}`,
      name,
      email: email || undefined,
      enrolledActivities,
      joinedDate: new Date().toISOString().split("T")[0],
    };

    const updated = [...attendees, newAttendee];
    saveAttendeesToLocal(updated);
    return newAttendee;
  };

  // 2. Update enrollments
  const handleUpdateEnrollment = (attendeeId: string, activities: string[]) => {
    const updated = attendees.map(att =>
      att.id === attendeeId ? { ...att, enrolledActivities: activities } : att
    );
    saveAttendeesToLocal(updated);

    // If active modal is open, sync modal profile
    if (activeReportAttendee && activeReportAttendee.id === attendeeId) {
      setActiveReportAttendee(prev => (prev ? { ...prev, enrolledActivities: activities } : null));
    }
  };

  const handleRemoveAttendee = (attendeeId: string) => {
    const updatedAttendees = attendees.filter(att => att.id !== attendeeId);
    saveAttendeesToLocal(updatedAttendees);

    const updatedRecords = records.filter(rec => rec.attendeeId !== attendeeId);
    saveRecordsToLocal(updatedRecords);

    const updatedNotes = { ...notes };
    delete updatedNotes[attendeeId];
    saveNotesToLocal(updatedNotes);

    if (activeReportAttendee && activeReportAttendee.id === attendeeId) {
      setActiveReportAttendee(null);
    }
  };

  // 3. Save manual session checklist records
  const handleSaveRecords = (newRecordsToSave: Omit<AttendanceRecord, "id">[]) => {
    if (newRecordsToSave.length === 0) return;

    const { date, activity } = newRecordsToSave[0];

    // Remove any previous record matching this date and activity to overwrite/prevent duplicate logs
    const filtered = records.filter(r => !(r.date === date && r.activity === activity));

    const instantiated: AttendanceRecord[] = newRecordsToSave.map((rec, i) => ({
      ...rec,
      id: `log-${Date.now()}-${i}`,
    }));

    const updated = [...filtered, ...instantiated];
    saveRecordsToLocal(updated);
  };

  // 4. Batch import parsed files from Gemini
  const handleImportParsedData = (
    newAttendeesToCreate: Omit<Attendee, "id">[],
    newRecordsToSave: Omit<AttendanceRecord, "id">[]
  ) => {
    let currentAttendees = [...attendees];
    const createdMap: Record<string, string> = {}; // Maps name to generated attendee ID

    // Create new attendees
    newAttendeesToCreate.forEach((att, idx) => {
      const generatedId = `att-${Date.now()}-${idx}`;
      const newAtt: Attendee = {
        ...att,
        id: generatedId,
      };
      currentAttendees.push(newAtt);
      createdMap[att.name.toLowerCase()] = generatedId;
    });

    // Save newly created attendees
    saveAttendeesToLocal(currentAttendees);

    // Wire up logs records with their correct attendeeIds
    const finalLogs: AttendanceRecord[] = newRecordsToSave.map((rec, idx) => {
      let attendeeId = rec.attendeeId;

      if (!attendeeId) {
        // Link to newly created attendee
        attendeeId = createdMap[rec.attendeeName.toLowerCase()];
        
        // Or if existing, locate by name
        if (!attendeeId) {
          const existing = currentAttendees.find(
            a => a.name.toLowerCase() === rec.attendeeName.toLowerCase()
          );
          if (existing) attendeeId = existing.id;
        }
      }

      return {
        ...rec,
        attendeeId: attendeeId || `att-unknown-${idx}`,
        id: `log-${Date.now()}-imported-${idx}`,
      };
    });

    // Merge in imported logs
    const updatedRecords = [...records, ...finalLogs];
    saveRecordsToLocal(updatedRecords);
  };

  // 5. Save notes for progress report
  const handleSaveNotes = (attendeeId: string, text: string) => {
    const updatedNotes = {
      ...notes,
      [attendeeId]: text,
    };
    saveNotesToLocal(updatedNotes);
  };

  // 6. Restore demo/seed data
  const handleResetDatabase = () => {
    if (window.confirm("Are you sure you want to restore the demo seed data? This will overwrite your current progress.")) {
      setAttendees(initialAttendees);
      setRecords(initialAttendanceRecords);
      setNotes({});
      localStorage.setItem("english_tracker_attendees", JSON.stringify(initialAttendees));
      localStorage.setItem("english_tracker_records", JSON.stringify(initialAttendanceRecords));
      localStorage.setItem("english_tracker_notes", JSON.stringify({}));
      setActiveTab("dashboard");
    }
  };

  // Helper to open progress report of colleague
  const handleNavigateToAttendeeReport = (att: Attendee) => {
    setActiveReportAttendee(att);
  };

  return (
    <div className="min-h-screen bg-natural-cream flex flex-col font-sans text-natural-forest antialiased selection:bg-natural-wheat selection:text-natural-forest">
      
      {/* Top Banner Branding Header */}
      <header className="bg-white border-b border-natural-border sticky top-0 z-30 shadow-sm" id="main-header">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-natural-forest rounded-xl flex items-center justify-center text-natural-wheat shadow-md font-serif font-bold italic text-lg">
              H
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-[#1A1A1A] tracking-tight">The Honeycomb</h1>
              <p className="text-[10px] text-natural-sage font-bold uppercase tracking-wider">Attendance & Cross-Referencing</p>
            </div>
          </div>

          <div className="flex items-center space-x-4 self-end sm:self-auto text-xs text-natural-forest/80 font-medium">
            <span className="flex items-center gap-1.5 bg-natural-wheat/40 px-3 py-1.5 rounded-lg border border-natural-border/60">
              <Clock className="h-3.5 w-3.5 text-natural-sage" />
              <span>June 24, 2026</span>
            </span>
            <button
              onClick={handleResetDatabase}
              className="flex items-center gap-1 hover:text-natural-sand text-natural-forest font-bold transition py-1"
              title="Reset database to default seed data"
            >
              <RefreshCw className="h-3.5 w-3.5 text-natural-sage" />
              <span>Reset Demo Seed</span>
            </button>
          </div>

        </div>
      </header>

      {/* Navigation Sub-Header */}
      <nav className="bg-[#FAEDCD]/20 border-b border-natural-border sticky top-[73px] sm:top-[73px] z-20 backdrop-blur-md" id="nav-tabs">
        <div className="max-w-7xl mx-auto px-6 flex space-x-1 sm:space-x-4 overflow-x-auto">
          
          {/* Tab 1: Dashboard */}
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 py-4 px-3 font-semibold text-sm border-b-2 transition duration-200 whitespace-nowrap font-serif ${
              activeTab === "dashboard"
                ? "border-natural-forest text-natural-forest font-bold"
                : "border-transparent text-natural-forest/60 hover:text-natural-forest hover:border-natural-sage"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </button>

          {/* Tab 2: Manual Check-in */}
          <button
            type="button"
            onClick={() => setActiveTab("logger")}
            className={`flex items-center gap-2 py-4 px-3 font-semibold text-sm border-b-2 transition duration-200 whitespace-nowrap font-serif ${
              activeTab === "logger"
                ? "border-natural-forest text-natural-forest font-bold"
                : "border-transparent text-natural-forest/60 hover:text-natural-forest hover:border-natural-sage"
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            <span>Manual Check-In</span>
          </button>

          {/* Tab 3: Attendees Directory */}
          <button
            type="button"
            onClick={() => setActiveTab("attendees")}
            className={`flex items-center gap-2 py-4 px-3 font-semibold text-sm border-b-2 transition duration-200 whitespace-nowrap font-serif ${
              activeTab === "attendees"
                ? "border-natural-forest text-natural-forest font-bold"
                : "border-transparent text-natural-forest/60 hover:text-natural-forest hover:border-natural-sage"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Caserits & Progress</span>
          </button>

          {/* Tab 4: Cross-Referencer */}
          <button
            type="button"
            onClick={() => setActiveTab("crossref")}
            className={`flex items-center gap-2 py-4 px-3 font-semibold text-sm border-b-2 transition duration-200 whitespace-nowrap font-serif ${
              activeTab === "crossref"
                ? "border-natural-forest text-natural-forest font-bold"
                : "border-transparent text-natural-forest/60 hover:text-natural-forest hover:border-natural-sage"
            }`}
          >
            <GitCompare className="h-4 w-4" />
            <span>Overlap Cross-Referencer</span>
          </button>

          {/* Tab 5: Smart Parser */}
          <button
            type="button"
            onClick={() => setActiveTab("parser")}
            className={`flex items-center gap-2 py-4 px-3 font-semibold text-sm border-b-2 transition duration-200 whitespace-nowrap font-serif ${
              activeTab === "parser"
                ? "border-natural-forest text-natural-forest font-bold"
                : "border-transparent text-natural-forest/60 hover:text-natural-forest hover:border-natural-sage"
            }`}
          >
            <FileUp className="h-4 w-4" />
            <span>Import Forage Logs</span>
          </button>

        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        
        {/* Tab Router Panels */}
        {activeTab === "dashboard" && (
          <DashboardStats
            attendees={attendees}
            records={records}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === "logger" && (
          <AttendanceLogger
            attendees={attendees}
            records={records}
            onAddAttendee={handleAddAttendee}
            onSaveRecords={handleSaveRecords}
          />
        )}

        {activeTab === "attendees" && (
          <AttendeeDirectory
            attendees={attendees}
            records={records}
            onAddAttendee={handleAddAttendee}
            onUpdateEnrollment={handleUpdateEnrollment}
            onViewReport={handleNavigateToAttendeeReport}
            onRemoveAttendee={handleRemoveAttendee}
          />
        )}

        {activeTab === "crossref" && (
          <CrossReferenceHub
            attendees={attendees}
            records={records}
            onNavigateToAttendee={(att) => {
              setActiveReportAttendee(att);
            }}
          />
        )}

        {activeTab === "parser" && (
          <DocumentParser
            attendees={attendees}
            onImportData={handleImportParsedData}
          />
        )}

      </main>

      {/* Popups and Modals */}
      {activeReportAttendee && (
        <ProgressReportModal
          attendee={activeReportAttendee}
          records={records}
          notes={notes[activeReportAttendee.id] || ""}
          onClose={() => setActiveReportAttendee(null)}
          onSaveNotes={handleSaveNotes}
        />
      )}

      {/* Simple Professional Footer */}
      <footer className="bg-natural-forest text-natural-cream border-t border-natural-forest/20 py-8 text-center text-xs font-serif uppercase tracking-widest mt-12">
        <span>© 2026 The Honeycomb • English Activities Dashboard</span>
      </footer>

    </div>
  );
}
