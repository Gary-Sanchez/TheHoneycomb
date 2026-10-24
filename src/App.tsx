import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Attendee, AttendanceRecord, AuthStatus, ImportFingerprint, ImportOutcome, ManualCheckInResult } from "./types";
import { formatDisplayDate, nameKey, REFERENCE_DATE } from "./utils";
import { ALL_TIME, PeriodFilter } from "./beehavior";
import DashboardStats from "./components/DashboardStats";
import AttendanceLogger from "./components/AttendanceLogger";
import AttendeeDirectory from "./components/AttendeeDirectory";
import CrossReferenceHub from "./components/CrossReferenceHub";
import DocumentParser from "./components/DocumentParser";
import ProgressReportModal from "./components/ProgressReportModal";
import SettingsPanel from "./components/SettingsPanel";
import { Alert, Button, Tabs, useToast } from "./components/ui";
import { LayoutDashboard, CheckSquare, Users, GitCompare, FileUp, Clock, Settings, Loader2, Lock, ShieldCheck, RotateCw } from "lucide-react";

type ServerState = { attendees: Attendee[]; records: AttendanceRecord[]; notes: Record<string, string> };

// US-59: the 6 main tabs (names unchanged). The id is the activeTab value the screens navigate with.
const MAIN_TABS = [
  { id: "dashboard", name: "Dashboard", Icon: LayoutDashboard },
  { id: "logger", name: "Manual Check-In", Icon: CheckSquare },
  { id: "attendees", name: "Caserits & Progress", Icon: Users },
  { id: "crossref", name: "Overlap Cross-Referencer", Icon: GitCompare },
  { id: "parser", name: "Import Forage Logs", Icon: FileUp },
  { id: "settings", name: "Settings", Icon: Settings },
] as const;

// BUG-08: what a reverted change tells the user (never the raw error); see persist()
const RETRY_HINT = "Check the connection and try again.";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  // US-35: Dashboard period. Lives here because DashboardStats unmounts on tab change; in memory
  // only, so a reload goes back to All time.
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(ALL_TIME);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  // BUG-09: why the initial load failed (null = it didn't), shown with a Retry button
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();
  const headerRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false, adminConfigured: false, setupAllowed: false });
  const canEdit = auth.authenticated;

  // Active colleague modal for viewing report
  const [activeReportAttendee, setActiveReportAttendee] = useState<Attendee | null>(null);

  // Mutation bookkeeping for persist() (US-21): how many are awaiting a response, a counter
  // bumped on every new one, and whether the current burst must reload once it settles
  const inFlightMutations = useRef(0);
  const mutationSeq = useRef(0);
  const reloadWhenIdle = useRef(false);

  // Resolves to null when the data loaded, or to the cause to show when it didn't (BUG-09). US-50:
  // e.g. a 503 when the data file is from a newer app, whose body says what happened.
  const loadData = (): Promise<string | null> =>
    fetch("/api/data")
      .then(async res => {
        if (!res.ok) {
          const message = await res.json().then(body => body?.error, () => undefined);
          throw new Error(message || `The server answered with an error (HTTP ${res.status}).`);
        }
        applyServerState(await res.json());
        return null;
      })
      .catch(err => {
        console.error("Failed to load data from server:", err);
        // fetch() itself rejects with a TypeError when the server can't be reached
        return err instanceof TypeError ? "Couldn't reach The Honeycomb server." : String(err?.message ?? err);
      });

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

  // Load initial state from the server-backed database (on mount, and again from Retry)
  const loadInitialState = () => {
    setIsLoading(true);
    setLoadError(null);
    Promise.all([loadData(), refreshAuth()])
      .then(([error]) => setLoadError(error))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A newly opened tab starts at the top instead of keeping the previous tab's scroll position
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // US-59: the window title names the open tab (the load error screen shows no tab, QA #74)
  const activeTabName = MAIN_TABS.find(tab => tab.id === activeTab)?.name ?? MAIN_TABS[0].name;
  useEffect(() => {
    document.title = loadError ? "The Honeycomb" : `${activeTabName} · The Honeycomb`;
  }, [activeTabName, loadError]);

  // BUG-10: the sticky nav sits right below the header, whose height changes with the width
  // (it wraps on phones): measure it into --header-height instead of a fixed top-[73px]. The nav
  // is measured too (--nav-height): together they are the scroll-padding-top of index.css, so the
  // skip link (or any focus) never leaves its target under the sticky bars (QA #74, WCAG 2.4.11).
  const showShell = !isLoading && !loadError;
  useLayoutEffect(() => {
    const header = headerRef.current;
    const nav = document.getElementById("nav-tabs");
    if (!showShell || !header) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
      if (nav) root.style.setProperty("--nav-height", `${nav.getBoundingClientRect().height}px`);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    if (nav) observer.observe(nav);
    return () => observer.disconnect();
  }, [showShell]);

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
  // Resolves to whether the server accepted the mutation (US-27 reports a failed batch import).
  // US-26: `onSaved` gets the server's state after the mutation; `onRejected` the server's error
  // message when it refuses it (e.g. a duplicate .csv).
  // BUG-08: any other failure (server error, unreachable server) shows `failureMessage` as an error
  // toast: what wasn't saved and what to do, never the raw error. A caller with `onRejected` shows
  // the error itself (Import Forage Logs, inline), so it gets no toast. A 401 only drops to read-only.
  const persist = (
    url: string,
    init: RequestInit,
    label: string,
    hooks: { onSaved?: (data: ServerState) => void; onRejected?: (message: string) => void; failureMessage?: string } = {}
  ): Promise<boolean> => {
    inFlightMutations.current += 1;
    mutationSeq.current += 1;
    if (inFlightMutations.current > 1) reloadWhenIdle.current = true;
    let snapshot: ServerState | null = null;

    return fetch(url, init)
      .then(async res => {
        if (res.status === 401) {
          setAuth(prev => ({ ...prev, authenticated: false }));
          reloadWhenIdle.current = true;
          return false;
        }
        if (!res.ok) {
          const message = await res.json().then(body => body?.error, () => undefined);
          if (message) hooks.onRejected?.(message);
          throw new Error(message || `HTTP ${res.status}`);
        }
        snapshot = await res.json();
        hooks.onSaved?.(snapshot!);
        return true;
      })
      .catch(err => {
        console.error(`Failed to persist ${label}:`, err);
        reloadWhenIdle.current = true;
        if (!hooks.onRejected) toast.error(hooks.failureMessage ?? `Couldn't save the changes. ${RETRY_HINT}`);
        return false;
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
      joinedDate: REFERENCE_DATE, // never the real date: it would postdate every session (US-24)
    };

    setAttendees(prev => [...prev, newAttendee]);

    persist("/api/attendees", jsonRequest("POST", newAttendee), "new attendee", {
      failureMessage: `Couldn't add the colleague. ${RETRY_HINT}`,
    });

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

    persist(`/api/attendees/${attendeeId}/enrollment`, jsonRequest("PUT", { activities }), "enrollment update", {
      failureMessage: `Couldn't save the activities. ${RETRY_HINT}`,
    });
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

    persist(`/api/attendees/${attendeeId}`, { method: "DELETE" }, "attendee removal", {
      failureMessage: `Couldn't remove the colleague. ${RETRY_HINT}`,
    });
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

    persist("/api/records", jsonRequest("POST", { records: instantiated }), "records", {
      failureMessage: `Couldn't save the attendance. ${RETRY_HINT}`,
    });
  };

  // 3b. Manually add one colleague to the session for a date+activity (US-20). Reuses an existing
  // colleague by name; the record joins that date+activity's session (or starts it), upserting
  // by attendeeId+date+activity so the same person is never logged twice in one session.
  // US-23: this window may be stale; the server re-matches by name and its response replaces
  // the optimistic state, so a colleague added from another window is reused, not duplicated.
  const handleManualCheckIn = (rawName: string, date: string, activity: string): ManualCheckInResult => {
    const name = rawName
      .trim()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const existingAttendee = attendees.find(a => nameKey(a.name) === nameKey(name));
    const attendee: Attendee = existingAttendee ?? {
      id: `att-${Date.now()}`,
      name,
      enrolledActivities: [],
      joinedDate: date, // the session they're checked into (informative only since US-31)
    };
    const joinedExistingSession = records.some(r => r.date === date && r.activity === activity);
    const alreadyInSession = records.find(
      r => r.attendeeId === attendee.id && r.date === date && r.activity === activity
    );

    const record: AttendanceRecord = {
      id: alreadyInSession?.id ?? `log-${Date.now()}-manual`,
      attendeeId: attendee.id,
      attendeeName: attendee.name,
      activity,
      date,
      status: "present",
    };

    if (!existingAttendee) setAttendees(prev => [...prev, attendee]);
    setRecords(prev => [
      ...prev.filter(r => !(r.attendeeId === attendee.id && r.date === date && r.activity === activity)),
      record,
    ]);

    persist(
      "/api/records/manual",
      jsonRequest("POST", { attendee: existingAttendee ? undefined : attendee, record }),
      "manual check-in",
      { failureMessage: `Couldn't check in the colleague. ${RETRY_HINT}` }
    );

    return { attendee, isNew: !existingAttendee, joinedExistingSession, alreadyInSession: Boolean(alreadyInSession) };
  };

  // 4. Batch import parsed files from the Smart Document Parser
  // US-26: `fingerprints` (one per .csv) are saved with the import; the server refuses a .csv that
  // was already imported (409) and the optimistic update is then undone by persist().
  const handleImportParsedData = async (
    newAttendeesToCreate: Omit<Attendee, "id">[],
    newRecordsToSave: Omit<AttendanceRecord, "id">[],
    fingerprints: Omit<ImportFingerprint, "importedAt">[] = []
  ): Promise<ImportOutcome> => {
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

    // Merge in imported logs. Mirrors importParsedData (db.ts): a colleague already logged in that
    // date+activity event isn't logged again ("present" wins over "absent").
    const nameById = new Map(currentAttendees.map(att => [att.id, nameKey(att.name)]));
    const sessionKey = (rec: AttendanceRecord) =>
      `${nameById.get(rec.attendeeId) ?? nameKey(rec.attendeeName)}|${rec.date}|${rec.activity}`;
    const existingKeys = new Set(records.map(sessionKey));
    const added = finalLogs.filter(rec => !existingKeys.has(sessionKey(rec)));
    const presentKeys = new Set(finalLogs.filter(rec => rec.status === "present").map(sessionKey));
    setRecords(prev => [
      ...prev.map(rec => (presentKeys.has(sessionKey(rec)) ? { ...rec, status: "present" as const } : rec)),
      ...added,
    ]);

    // The server's state is the truth for how many logs were added or turned present (this window
    // may be stale). US-33: the server refuses (409) a .csv whose event already holds all its colleagues.
    let error: string | undefined;
    let addedCount = added.length;
    const sentIds = new Set(finalLogs.map(rec => rec.id));
    const absentIds = new Set(records.filter(rec => rec.status === "absent").map(rec => rec.id));
    let updatedCount = records.filter(rec => absentIds.has(rec.id) && presentKeys.has(sessionKey(rec))).length;
    const saved = await persist(
      "/api/records/import",
      jsonRequest("POST", { attendees: createdAttendees, records: finalLogs, fingerprints }),
      "imported data",
      {
        onSaved: data => {
          addedCount = data.records.filter(rec => sentIds.has(rec.id)).length;
          updatedCount = data.records.filter(rec => absentIds.has(rec.id) && rec.status === "present").length;
        },
        onRejected: message => (error = message),
      }
    );
    return saved ? { ok: true, added: addedCount, updated: updatedCount } : { ok: false, error };
  };

  // 5. Save notes for progress report
  const handleSaveNotes = (attendeeId: string, text: string) => {
    setNotes(prev => ({ ...prev, [attendeeId]: text }));

    persist(`/api/notes/${attendeeId}`, jsonRequest("PUT", { text }), "note", {
      failureMessage: `Couldn't save the note. ${RETRY_HINT}`,
    });
  };

  // Helper to open progress report of colleague
  const handleNavigateToAttendeeReport = (att: Attendee) => {
    setActiveReportAttendee(att);
  };


  // US-59: the skip link moves focus to the open tab's content (not only the scroll position)
  const skipToContent = (e: MouseEvent) => {
    e.preventDefault();
    mainRef.current?.focus();
  };

  if (isLoading) {
    return (
      <div role="status" className="min-h-screen bg-natural-cream flex flex-col items-center justify-center gap-3 font-sans text-natural-forest">
        <Loader2 className="h-8 w-8 animate-spin text-natural-sage" aria-hidden="true" />
        <p className="text-sm font-semibold text-natural-sage">Loading The Honeycomb…</p>
      </div>
    );
  }

  // BUG-09: the initial load failed: say why and offer to request the data again
  if (loadError) {
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center px-4 py-8 font-sans text-forest">
        <div className="w-full max-w-lg space-y-4">
          <h1 className="text-h2 font-serif font-bold">The Honeycomb</h1>
          <Alert tone="danger" title="Couldn't load The Honeycomb's data." id="load-error">
            <p>{loadError}</p>
            <p className="mt-1">Check that The Honeycomb is running, then try again.</p>
          </Alert>
          <Button onClick={loadInitialState} icon={<RotateCw className="size-4" />}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  // The 3 tabs whose screen has no h2 of its own get a visually hidden one named after the tab
  // (Manual Check-In, Import Forage Logs and Settings render theirs)
  const tabHeading = (name: string) => <h2 className="sr-only">{name}</h2>;

  const tabContent: Record<string, any> = {
    dashboard: (
      <>
        {tabHeading("Dashboard")}
        <DashboardStats
          attendees={attendees}
          records={records}
          periodFilter={periodFilter}
          onPeriodFilterChange={setPeriodFilter}
          onNavigate={(tab) => setActiveTab(tab)}
        />
      </>
    ),
    logger: (
      <AttendanceLogger
        attendees={attendees}
        records={records}
        onAddAttendee={handleAddAttendee}
        onSaveRecords={handleSaveRecords}
        onManualCheckIn={handleManualCheckIn}
        canEdit={canEdit}
        onSignIn={() => setActiveTab("settings")}
      />
    ),
    attendees: (
      <>
        {tabHeading("Caserits & Progress")}
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
      </>
    ),
    crossref: (
      <>
        {tabHeading("Overlap Cross-Referencer")}
        <CrossReferenceHub
          attendees={attendees}
          records={records}
          onNavigateToAttendee={(att) => {
            setActiveReportAttendee(att);
          }}
        />
      </>
    ),
    parser: (
      <DocumentParser
        attendees={attendees}
        onImportData={handleImportParsedData}
        canEdit={canEdit}
        onSignIn={() => setActiveTab("settings")}
        onSessionExpired={() => setAuth(prev => ({ ...prev, authenticated: false }))}
      />
    ),
    settings: <SettingsPanel auth={auth} onAuthChange={refreshAuth} />,
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col font-sans text-forest antialiased selection:bg-wheat selection:text-forest">
      {/* US-59: first focusable element of the page; visible only while focused */}
      <a
        href="#main-content"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-toast)] focus:rounded-control focus:border focus:border-forest focus:bg-surface focus:px-4 focus:py-2 focus:text-body focus:font-semibold focus:text-forest"
      >
        Skip to content
      </a>

      {/* Top Banner Branding Header */}
      <header ref={headerRef} className="bg-surface border-b border-border sticky top-0 z-[var(--z-header)] shadow-sm" id="main-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">

          <div className="flex min-w-0 items-center gap-3">
            {/* The logo has its own name, outside the h1, so the heading is still just "The Honeycomb" */}
            <img src="/logo.svg" alt="The Honeycomb logo" width={40} height={40} className="size-10 shrink-0 rounded-xl shadow-md" />
            <div className="min-w-0">
              <h1 className="text-xl font-serif font-bold text-forest tracking-tight">The Honeycomb</h1>
              <p className="text-micro text-sage-text font-bold uppercase tracking-wider">Attendance & Cross-Referencing</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 ml-auto text-xs text-forest/80 font-medium">
            <span className="flex items-center gap-1.5 bg-wheat/40 px-3 py-1.5 rounded-lg border border-border/60 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
              {/* US-46: the header date comes from REFERENCE_DATE, in the one display format */}
              <span>{formatDisplayDate(REFERENCE_DATE)}</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              id="auth-badge"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold whitespace-nowrap transition ${
                canEdit
                  ? "bg-moss/30 border-moss/70 text-forest"
                  : "bg-surface border-border text-forest/70 hover:text-forest"
              }`}
              title={canEdit ? "Admin session active" : "Read-only — sign in as admin in Settings"}
            >
              {canEdit ? <ShieldCheck className="h-3.5 w-3.5 text-sage" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5 text-sage" aria-hidden="true" />}
              <span>{canEdit ? "Admin" : "Sign In"}</span>
            </button>
          </div>

        </div>
      </header>

      {/* US-59: the tab list goes in the sticky nav (opaque, right below the header at its real height,
          BUG-10) and the open tab's panel in <main>, the skip link's target */}
      <Tabs
        label="Main sections"
        value={activeTab}
        onValueChange={setActiveTab}
        className="contents"
        panelClassName=""
        tabs={MAIN_TABS.map(({ id, name, Icon }) => ({
          id,
          label: (
            <span className="inline-flex items-center gap-2">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {name}
            </span>
          ),
          content: tabContent[id],
        }))}
        renderList={list => (
          <nav aria-label="Main" className="bg-cream sticky top-[var(--header-height)] z-[var(--z-nav)] shadow-[inset_0_-1px_0_var(--color-border)]" id="nav-tabs">
            <div className="max-w-7xl mx-auto sm:px-6">{list}</div>
          </nav>
        )}
        renderPanels={panels => (
          <main ref={mainRef} id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
            {panels}
          </main>
        )}
      />

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
      <footer className="bg-forest text-cream border-t border-forest/20 px-4 py-8 text-center text-xs font-serif uppercase tracking-widest mt-12">
        <span>© 2026 The Honeycomb • English Activities Dashboard</span>
      </footer>

    </div>
  );
}
