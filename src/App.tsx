import { useState, useEffect, useRef } from "react";
import { Attendee, AttendanceRecord, AuthStatus } from "./types";
import DashboardStats from "./components/DashboardStats";
import AttendanceLogger from "./components/AttendanceLogger";
import AttendeeDirectory from "./components/AttendeeDirectory";
import CrossReferenceHub from "./components/CrossReferenceHub";
import DocumentParser from "./components/DocumentParser";
import ProgressReportModal from "./components/ProgressReportModal";
import SettingsPanel from "./components/SettingsPanel";
import { GraduationCap, LayoutDashboard, CheckSquare, Users, GitCompare, FileUp, Clock, Settings, Loader2, Lock, ShieldCheck } from "lucide-react";

type ServerState = { attendees: Attendee[]; records: AttendanceRecord[]; notes: Record<string, string> };

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false, adminConfigured: false, setupAllowed: false });
  const canEdit = auth.authenticated;

  // Active colleague modal for viewing report
  const [activeReportAttendee, setActiveReportAttendee] = useState<Attendee | null>(null);

  // Mutation bookkeeping for persist() (US-21): how many are awaiting a response, a counter
  // bumped on every new one, and whether the current burst must reload once it settles
  const inFlightMutations = useRef(0);
  const mutationSeq = useRef(0);
  const reloadWhenIdle = useRef(false);

  const loadData = () =>
    fetch("/api/data")
      .then(res => res.json())
      .then(applyServerState)
      .catch(err => console.error("Failed to load data from server:", err));

  // Reload the canonical state, unless a newer mutation started meanwhile — its own response
  // will then be the fresher snapshot, and this GET may already be stale
  const reconcileWithServer = () => {
    const seq = mutationSeq.current;
    return fetch("/api/data")
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (seq === mutationSeq.current) applyServerState(data);
      })
      .catch(err => console.error("Failed to load data from server:", err));
  };

  const refreshAuth = () =>
    fetch("/api/auth/status")
      .then(res => res.json())
      .then((data: AuthStatus) => setAuth(data))
      .catch(err => console.error("Failed to load auth status:", err));

  // Load initial state from the server-backed database on mount
  useEffect(() => {
    Promise.all([loadData(), refreshAuth()]).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the server's canonical state after a mutation round-trips
  function applyServerState(data: ServerState) {
    setAttendees(data.attendees);
    setRecords(data.records);
    setNotes(data.notes);
  }

  // Send a mutation and reconcile with the server's canonical state. The optimistic local update
  // already refreshed every derived view (Dashboard, Bee-havior Hub, ...). Nothing is applied
  // while other mutations are still in flight: responses can arrive out of order, so an older,
  // slower snapshot must never overwrite newer data (US-21, e.g. quick-add a colleague + save
  // check-in). When the last one settles, a lone successful mutation applies its own snapshot;
  // an overlapping burst, a failure, or a lost admin session (401 → read-only, US-11) reloads
  // from the server instead, which also discards any optimistic change that wasn't persisted.
  const persist = (url: string, init: RequestInit, label: string) => {
    inFlightMutations.current += 1;
    mutationSeq.current += 1;
    if (inFlightMutations.current > 1) reloadWhenIdle.current = true;
    let snapshot: ServerState | null = null;

    return fetch(url, init)
      .then(async res => {
        if (res.status === 401) {
          setAuth(prev => ({ ...prev, authenticated: false }));
          reloadWhenIdle.current = true;
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        snapshot = await res.json();
      })
      .catch(err => {
        console.error(`Failed to persist ${label}:`, err);
        reloadWhenIdle.current = true;
      })
      .finally(() => {
        inFlightMutations.current -= 1;
        if (inFlightMutations.current > 0) return;
        if (reloadWhenIdle.current) {
          reloadWhenIdle.current = false;
          return reconcileWithServer();
        }
        if (snapshot) applyServerState(snapshot);
      });
  };

  const jsonRequest = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

    persist("/api/attendees", jsonRequest("POST", newAttendee), "new attendee");

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

    persist(`/api/attendees/${attendeeId}/enrollment`, jsonRequest("PUT", { activities }), "enrollment update");
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

    persist(`/api/attendees/${attendeeId}`, { method: "DELETE" }, "attendee removal");
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

    persist("/api/records", jsonRequest("POST", { records: instantiated }), "records");
  };

  // 4. Batch import parsed files from the Smart Document Parser
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

    persist("/api/records/import", jsonRequest("POST", { attendees: createdAttendees, records: finalLogs }), "imported data");
  };

  // 5. Save notes for progress report
  const handleSaveNotes = (attendeeId: string, text: string) => {
    setNotes(prev => ({ ...prev, [attendeeId]: text }));

    persist(`/api/notes/${attendeeId}`, jsonRequest("PUT", { text }), "note");
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
              type="button"
              onClick={() => setActiveTab("settings")}
              id="auth-badge"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition ${
                canEdit
                  ? "bg-[#CCD5AE]/30 border-[#CCD5AE]/70 text-natural-forest"
                  : "bg-white border-natural-border text-natural-forest/70 hover:text-natural-forest"
              }`}
              title={canEdit ? "Admin session active" : "Read-only — sign in as admin in Settings"}
            >
              {canEdit ? <ShieldCheck className="h-3.5 w-3.5 text-natural-sage" /> : <Lock className="h-3.5 w-3.5 text-natural-sage" />}
              <span>{canEdit ? "Admin" : "Sign In"}</span>
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
            canEdit={canEdit}
            onSignIn={() => setActiveTab("settings")}
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
            canEdit={canEdit}
            onSignIn={() => setActiveTab("settings")}
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
            canEdit={canEdit}
            onSignIn={() => setActiveTab("settings")}
          />
        )}

        {activeTab === "settings" && <SettingsPanel auth={auth} onAuthChange={refreshAuth} />}

      </main>

      {/* Popups and Modals */}
      {activeReportAttendee && (
        <ProgressReportModal
          attendee={activeReportAttendee}
          records={records}
          notes={notes[activeReportAttendee.id] || ""}
          onClose={() => setActiveReportAttendee(null)}
          onSaveNotes={handleSaveNotes}
          canEdit={canEdit}
        />
      )}

      {/* Simple Professional Footer */}
      <footer className="bg-natural-forest text-natural-cream border-t border-natural-forest/20 py-8 text-center text-xs font-serif uppercase tracking-widest mt-12">
        <span>© 2026 The Honeycomb • English Activities Dashboard</span>
      </footer>

    </div>
  );
}
