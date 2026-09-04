import { useState, useEffect } from "react";
import { Attendee, AttendanceRecord } from "./types";
import DashboardStats from "./components/DashboardStats";
import AttendanceLogger from "./components/AttendanceLogger";
import AttendeeDirectory from "./components/AttendeeDirectory";
import CrossReferenceHub from "./components/CrossReferenceHub";
import DocumentParser from "./components/DocumentParser";
import ProgressReportModal from "./components/ProgressReportModal";
import SettingsPanel from "./components/SettingsPanel";
import { GraduationCap, LayoutDashboard, CheckSquare, Users, GitCompare, FileUp, RefreshCw, Clock, Settings, Loader2 } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Active colleague modal for viewing report
  const [activeReportAttendee, setActiveReportAttendee] = useState<Attendee | null>(null);

  // Load initial state from the server-backed database on mount
  useEffect(() => {
    fetch("/api/data")
      .then(res => res.json())
      .then(data => {
        setAttendees(data.attendees);
        setRecords(data.records);
        setNotes(data.notes);
      })
      .catch(err => console.error("Failed to load data from server:", err))
      .finally(() => setIsLoading(false));
  }, []);

  // Apply the server's canonical state after a mutation round-trips
  const applyServerState = (data: { attendees: Attendee[]; records: AttendanceRecord[]; notes: Record<string, string> }) => {
    setAttendees(data.attendees);
    setRecords(data.records);
    setNotes(data.notes);
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

    setAttendees(prev => [...prev, newAttendee]);

    fetch("/api/attendees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAttendee),
    })
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to persist new attendee:", err));

    return newAttendee;
  };

  // 2. Update enrollments
  const handleUpdateEnrollment = (attendeeId: string, activities: string[]) => {
    setAttendees(prev =>
      prev.map(att => (att.id === attendeeId ? { ...att, enrolledActivities: activities } : att))
    );

    // If active modal is open, sync modal profile
    if (activeReportAttendee && activeReportAttendee.id === attendeeId) {
      setActiveReportAttendee(prev => (prev ? { ...prev, enrolledActivities: activities } : null));
    }

    fetch(`/api/attendees/${attendeeId}/enrollment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activities }),
    })
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to persist enrollment update:", err));
  };

  const handleRemoveAttendee = (attendeeId: string) => {
    setAttendees(prev => prev.filter(att => att.id !== attendeeId));
    setRecords(prev => prev.filter(rec => rec.attendeeId !== attendeeId));
    setNotes(prev => {
      const updated = { ...prev };
      delete updated[attendeeId];
      return updated;
    });

    if (activeReportAttendee && activeReportAttendee.id === attendeeId) {
      setActiveReportAttendee(null);
    }

    fetch(`/api/attendees/${attendeeId}`, { method: "DELETE" })
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to persist attendee removal:", err));
  };

  // 3. Save manual session checklist records
  const handleSaveRecords = (newRecordsToSave: Omit<AttendanceRecord, "id">[]) => {
    if (newRecordsToSave.length === 0) return;

    const { date, activity } = newRecordsToSave[0];

    const instantiated: AttendanceRecord[] = newRecordsToSave.map((rec, i) => ({
      ...rec,
      id: `log-${Date.now()}-${i}`,
    }));

    // Remove any previous record matching this date and activity to overwrite/prevent duplicate logs
    setRecords(prev => {
      const filtered = prev.filter(r => !(r.date === date && r.activity === activity));
      return [...filtered, ...instantiated];
    });

    fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: instantiated }),
    })
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to persist records:", err));
  };

  // 4. Batch import parsed files from Gemini
  const handleImportParsedData = (
    newAttendeesToCreate: Omit<Attendee, "id">[],
    newRecordsToSave: Omit<AttendanceRecord, "id">[]
  ) => {
    let currentAttendees = [...attendees];
    const createdMap: Record<string, string> = {}; // Maps name to generated attendee ID
    const createdAttendees: Attendee[] = [];

    // Create new attendees
    newAttendeesToCreate.forEach((att, idx) => {
      const generatedId = `att-${Date.now()}-${idx}`;
      const newAtt: Attendee = {
        ...att,
        id: generatedId,
      };
      currentAttendees.push(newAtt);
      createdAttendees.push(newAtt);
      createdMap[att.name.toLowerCase()] = generatedId;
    });

    setAttendees(currentAttendees);

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
    setRecords(prev => [...prev, ...finalLogs]);

    fetch("/api/records/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendees: createdAttendees, records: finalLogs }),
    })
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to persist imported data:", err));
  };

  // 5. Save notes for progress report
  const handleSaveNotes = (attendeeId: string, text: string) => {
    setNotes(prev => ({ ...prev, [attendeeId]: text }));

    fetch(`/api/notes/${attendeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to persist note:", err));
  };

  // 6. Restore demo/seed data
  const handleResetDatabase = () => {
    if (window.confirm("Are you sure you want to restore the demo seed data? This will overwrite your current progress.")) {
      fetch("/api/reset", { method: "POST" })
        .then(res => res.json())
        .then(data => {
          applyServerState(data);
          setActiveTab("dashboard");
        })
        .catch(err => console.error("Failed to reset database:", err));
    }
  };

  // Helper to open progress report of colleague
  const handleNavigateToAttendeeReport = (att: Attendee) => {
    setActiveReportAttendee(att);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-natural-cream flex flex-col items-center justify-center gap-3 font-sans text-natural-forest">
        <Loader2 className="h-8 w-8 animate-spin text-natural-sage" />
        <p className="text-sm font-semibold text-natural-sage">Loading The Honeycomb...</p>
      </div>
    );
  }

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

          {/* Tab 6: Settings */}
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 py-4 px-3 font-semibold text-sm border-b-2 transition duration-200 whitespace-nowrap font-serif ${
              activeTab === "settings"
                ? "border-natural-forest text-natural-forest font-bold"
                : "border-transparent text-natural-forest/60 hover:text-natural-forest hover:border-natural-sage"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
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

        {activeTab === "settings" && <SettingsPanel />}

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
