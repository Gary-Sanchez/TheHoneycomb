import { useState, useMemo, FormEvent } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES, ActivityType, ManualCheckInResult } from "../types";
import { REFERENCE_DATE, formatDisplayDate } from "../utils";
import { ACTIVITY_THEME } from "../activityTheme";
import { Calendar, Check, X, UserPlus, AlertCircle } from "lucide-react";
import confetti from "canvas-confetti";
import ReadOnlyNotice from "./ReadOnlyNotice";
import { Button, Card, DateInput, EmptyState, Field, IconButton, Input, PageHeader, Panel, SegmentedControl, Select, useToast } from "./ui";

interface AttendanceLoggerProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onAddAttendee: (name: string, email: string, activities: string[]) => Attendee;
  onSaveRecords: (newRecords: Omit<AttendanceRecord, "id">[]) => void;
  onManualCheckIn: (name: string, date: string, activity: string) => ManualCheckInResult;
  canEdit: boolean;
  onSignIn?: () => void;
}

type AttendanceStatus = "present" | "absent";

// US-60: the Present / Absent options shared by every row (icons are decorative).
const STATUS_OPTIONS = [
  {
    value: "present",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Check className="size-4" aria-hidden="true" />
        Present
      </span>
    ),
  },
  {
    value: "absent",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <X className="size-4" aria-hidden="true" />
        Absent
      </span>
    ),
  },
];

const MARK_ALL_OPTIONS = [
  { value: "present", label: "All Present" },
  { value: "absent", label: "All Absent" },
];

const INLINE_NAME_ID = "manual-checkin-name";

export default function AttendanceLogger({
  attendees,
  records,
  onAddAttendee,
  onSaveRecords,
  onManualCheckIn,
  canEdit,
  onSignIn,
}: AttendanceLoggerProps) {
  const toast = useToast();
  const todayStr = REFERENCE_DATE; // Preset date reflecting system time
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType>(ACTIVITIES[0]);

  // Track present/absent statuses for enrolled attendees
  // Key: attendeeId, Value: "present" | "absent" | undefined
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  // Quick Add Attendee States
  const [quickName, setQuickName] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // All employees are eligible for check-in since participation is voluntary
  const enrolledAttendees = useMemo(() => {
    return attendees;
  }, [attendees]);

  // Inline quick-introduce state
  const [inlineName, setInlineName] = useState("");
  // US-60: "Add & Check In" with an empty name says so next to the field instead of doing nothing
  const [inlineError, setInlineError] = useState("");

  const handleInlineSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!inlineName.trim()) {
      setInlineError("Enter the colleague's name.");
      document.getElementById(INLINE_NAME_ID)?.focus();
      return;
    }
    if (!selectedDate) return;

    // US-20: persist right away as a Present record in this date+activity session
    const { attendee, isNew, joinedExistingSession, alreadyInSession } = onManualCheckIn(
      inlineName,
      selectedDate,
      selectedActivity
    );

    // The persisted record is now the source of truth for this colleague's status
    setStatuses(prev => {
      const next = { ...prev };
      delete next[attendee.id];
      return next;
    });

    setInlineName("");
    setInlineError("");

    // Blast confetti!
    confetti({
      particleCount: 50,
      spread: 40,
      origin: { y: 0.8 },
      disableForReducedMotion: true
    });

    const sessionNote = alreadyInSession
      ? "already in this event, no duplicate created"
      : joinedExistingSession
        ? "joined the existing event"
        : "new event created";
    toast.success(
      `${isNew ? "Added and checked in" : "Checked in"} ${attendee.name} for ${selectedActivity} on ${formatDisplayDate(selectedDate)} (${sessionNote}).`
    );
  };

  // Check if there are already records logged for this date and activity
  const existingRecords = useMemo(() => {
    return records.filter(r => r.date === selectedDate && r.activity === selectedActivity);
  }, [records, selectedDate, selectedActivity]);

  // Colleagues already checked in (Present) for the selected date+activity session
  const sessionPresent = useMemo(
    () => existingRecords.filter(r => r.status === "present"),
    [existingRecords]
  );

  // Set default status (Present) for anyone not configured in statuses
  const getStatus = (attendeeId: string): AttendanceStatus => {
    if (statuses[attendeeId]) {
      return statuses[attendeeId];
    }
    // Check if there is an existing record in history for this date/activity
    const existing = existingRecords.find(r => r.attendeeId === attendeeId);
    if (existing) {
      return existing.status;
    }
    return "present"; // Default new logs to present
  };

  // All Present / All Absent shows as selected only when every colleague has that status
  const markAllValue = (() => {
    if (enrolledAttendees.length === 0) return undefined;
    const all = enrolledAttendees.map(att => getStatus(att.id));
    if (all.every(s => s === "present")) return "present";
    if (all.every(s => s === "absent")) return "absent";
    return undefined;
  })();

  const handleToggleStatus = (attendeeId: string, status: AttendanceStatus) => {
    setStatuses(prev => ({
      ...prev,
      [attendeeId]: status,
    }));
  };

  const handleMarkAll = (status: AttendanceStatus) => {
    const nextStatuses: Record<string, AttendanceStatus> = {};
    enrolledAttendees.forEach(att => {
      nextStatuses[att.id] = status;
    });
    setStatuses(nextStatuses);
  };

  const handleQuickAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit || !quickName.trim()) return;

    // Add attendee with empty enrolled list since they are all colleagues of the company
    const newAtt = onAddAttendee(quickName.trim(), quickEmail.trim(), []);

    // Default their status to present in the form state
    setStatuses(prev => ({
      ...prev,
      [newAtt.id]: "present",
    }));

    // Reset fields
    setQuickName("");
    setQuickEmail("");
    setShowQuickAdd(false);

    // Blast confetti!
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 },
      disableForReducedMotion: true
    });

    toast.success(`Added ${newAtt.name} to the directory.`);
  };

  const handleSave = () => {
    if (!canEdit) return;
    const recordsToSave: Omit<AttendanceRecord, "id">[] = enrolledAttendees.map(att => ({
      attendeeId: att.id,
      attendeeName: att.name,
      activity: selectedActivity,
      date: selectedDate,
      status: getStatus(att.id),
    }));

    onSaveRecords(recordsToSave);

    // Bling confetti!
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.8 },
      disableForReducedMotion: true
    });

    toast.success(`Attendance saved for ${selectedActivity} on ${formatDisplayDate(selectedDate)}.`);
    setStatuses({}); // Clear status buffer
  };

  const activityTheme = ACTIVITY_THEME[selectedActivity];
  const ActivityIcon = activityTheme.icon;

  return (
    <Panel className="space-y-6 animate-fade-in" id="attendance-logger-tab">
      {/* Header section */}
      <PageHeader
        title="Log Event Attendance"
        description="Select a date and activity to check in colleagues."
        actions={
          <>
            {/* Quick Mark All */}
            {enrolledAttendees.length > 0 && (
              <SegmentedControl
                label="Mark every colleague"
                options={MARK_ALL_OPTIONS}
                value={markAllValue}
                onValueChange={(value: string) => handleMarkAll(value as AttendanceStatus)}
                disabled={!canEdit}
              />
            )}

            {/* Quick Add Button */}
            <Button
              variant="secondary"
              icon={<UserPlus className="size-4" />}
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              aria-expanded={showQuickAdd}
              disabled={!canEdit}
            >
              Add Colleague
            </Button>
          </>
        }
      />

      {!canEdit && <ReadOnlyNotice onSignIn={onSignIn} />}

      {/* Configuration Inputs */}
      <Card>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field
            id="checkin-date"
            label={
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 text-forest" aria-hidden="true" />
                Event Date
              </span>
            }
          >
            <DateInput
              value={selectedDate}
              onChange={(e: { target: { value: string } }) => {
                setSelectedDate(e.target.value);
                setStatuses({});
              }}
            />
          </Field>

          <Field
            id="checkin-activity"
            label={
              <span className="inline-flex items-center gap-1.5">
                <ActivityIcon className={`size-4 ${activityTheme.textClass}`} aria-hidden="true" />
                Activity
              </span>
            }
          >
            <Select
              value={selectedActivity}
              onChange={(e: { target: { value: string } }) => {
                setSelectedActivity(e.target.value as ActivityType);
                setStatuses({});
              }}
            >
              {ACTIVITIES.map(act => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* Inline Introduce New Colleague */}
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <UserPlus className="size-5 text-forest" aria-hidden="true" />
            Add and Check In a Colleague
          </span>
        }
      >
        <form onSubmit={handleInlineSubmit}>
          <fieldset disabled={!canEdit} className="min-w-0 space-y-3">
            <p className="text-body text-text-muted">
              Type a colleague's name to add them (or find them in the directory) and save them as <strong className="text-forest">Present</strong> in the event for the selected date and activity.
            </p>
            <div id="manual-session-target" className="flex flex-wrap items-center gap-2 text-body">
              <span className="inline-flex items-center gap-1.5 rounded-control border border-border bg-cream px-2.5 py-1 font-semibold text-forest">
                <ActivityIcon className={`size-4 shrink-0 ${activityTheme.textClass}`} aria-hidden="true" />
                <span className={`size-2 shrink-0 rounded-chip ${activityTheme.bgClass}`} aria-hidden="true" />
                {selectedActivity} · {selectedDate ? formatDisplayDate(selectedDate) : "No date selected"}
              </span>
              <span className="font-semibold text-sage-text">
                {existingRecords.length > 0
                  ? `Joins the existing event (${sessionPresent.length} present)`
                  : "A new event will be created"}
              </span>
            </div>
            {sessionPresent.length > 0 && (
              <div id="manual-session-members" className="flex flex-wrap gap-1.5">
                {sessionPresent.map(r => (
                  <span
                    key={r.id}
                    className="rounded-chip border border-moss bg-moss/30 px-2 py-0.5 text-micro font-semibold text-forest"
                  >
                    {r.attendeeName}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              {/* The name keeps its accessible label without adding visible text (the placeholder shows the hint) */}
              <Field id={INLINE_NAME_ID} label="Colleague name" error={inlineError || undefined} className="flex-1 [&>label]:sr-only">
                <Input
                  type="text"
                  placeholder="Enter the colleague's full name…"
                  value={inlineName}
                  onChange={(e: { target: { value: string } }) => {
                    setInlineName(e.target.value);
                    if (inlineError) setInlineError("");
                  }}
                />
              </Field>
              <Button type="submit" className="font-serif">
                Add & Check In
              </Button>
            </div>
          </fieldset>
        </form>
      </Card>

      {/* Quick Add Form */}
      {showQuickAdd && (
        <Card
          className="animate-slide-down"
          title={
            <span className="inline-flex items-center gap-2 font-serif">
              <UserPlus className="size-5 text-forest" aria-hidden="true" />
              Add Colleague
            </span>
          }
          actions={<IconButton aria-label="Cancel" icon={<X className="size-4" />} onClick={() => setShowQuickAdd(false)} />}
        >
          <form onSubmit={handleQuickAddSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="quick-add-name" label="Full Name">
                <Input
                  type="text"
                  required
                  placeholder="e.g. Jean Dupont"
                  value={quickName}
                  onChange={(e: { target: { value: string } }) => setQuickName(e.target.value)}
                />
              </Field>

              <Field id="quick-add-email" label="Email Address (Optional)">
                <Input
                  type="email"
                  placeholder="e.g. jean@example.com"
                  value={quickEmail}
                  onChange={(e: { target: { value: string } }) => setQuickEmail(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowQuickAdd(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Colleague</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Roster / Attendee Checklist */}
      <Card title={`Active Attendance List (${enrolledAttendees.length})`}>
        {existingRecords.length > 0 && (
          <p className="mb-4 inline-flex items-start gap-1.5 rounded-control border border-warning-border bg-warning-bg px-3 py-1 text-body font-semibold text-warning">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Existing attendance records for this event will be updated
          </p>
        )}

        {enrolledAttendees.length === 0 ? (
          <EmptyState
            headingLevel={4}
            title="No colleagues are currently registered in the database."
            action={
              <Button icon={<UserPlus className="size-4" />} onClick={() => setShowQuickAdd(true)} disabled={!canEdit}>
                Add First Colleague
              </Button>
            }
          />
        ) : (
          <>
            {/* The list grows with the page: no scroll box of its own */}
            <ul className="divide-y divide-border">
              {enrolledAttendees.map(att => {
                const currentStatus = getStatus(att.id);
                return (
                  <li key={att.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-body font-bold text-forest">{att.name}</p>
                      <p className="mt-0.5 font-mono text-micro break-all text-text-muted">{att.email || "No email registered"}</p>
                    </div>

                    {/* Attendance Controls */}
                    <SegmentedControl
                      label={`Attendance for ${att.name}`}
                      options={STATUS_OPTIONS}
                      value={currentStatus}
                      onValueChange={(value: string) => handleToggleStatus(att.id, value as AttendanceStatus)}
                      disabled={!canEdit}
                      className="self-start sm:self-auto"
                    />
                  </li>
                );
              })}
            </ul>

            {/* Save Button */}
            <div className="mt-2 flex justify-end border-t border-border pt-4">
              <Button className="font-serif" onClick={handleSave} disabled={!canEdit}>
                Save Attendance Records
              </Button>
            </div>
          </>
        )}
      </Card>
    </Panel>
  );
}
