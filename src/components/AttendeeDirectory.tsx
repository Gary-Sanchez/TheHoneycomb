import { useState, useMemo, useRef, FormEvent } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import { Search, UserPlus, FileBarChart2, X, Mail, Calendar, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";
import ReadOnlyNotice from "./ReadOnlyNotice";
import { formatDisplayDate, pluralize, sortByName } from "../utils";
import { computeBeehavior } from "../beehavior";
import TierBadge from "./TierBadge";
import { Badge, Button, ConfirmDialog, DataTable, Field, IconButton, Input, Select, type DataTableColumn } from "./ui";

interface AttendeeDirectoryProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onAddAttendee: (name: string, email: string, activities: string[]) => Attendee;
  onUpdateEnrollment: (attendeeId: string, activities: string[]) => void;
  onViewReport: (attendee: Attendee) => void;
  onRemoveAttendee: (id: string) => void;
  canEdit: boolean;
  onSignIn?: () => void;
}

type AttendeeStat = { total: number; present: number; rate: number | null; overallPresents: number; overallTotal: number };
const NO_STAT: AttendeeStat = { total: 0, present: 0, rate: null, overallPresents: 0, overallTotal: 0 };

// US-62: two initials — first and last word of the name; a single word gives its first two letters
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[words.length - 1])[0]];
  return letters.join("").toLocaleUpperCase();
}

export default function AttendeeDirectory({
  attendees,
  records,
  onAddAttendee,
  onUpdateEnrollment,
  onViewReport,
  onRemoveAttendee,
  canEdit,
  onSignIn,
}: AttendeeDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedActivityFilter, setSelectedActivityFilter] = useState<string>("All");

  // Registration Form Toggle & State
  const [showRegForm, setShowRegForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newEnrolled, setNewEnrolled] = useState<string[]>([]);

  // Deletion confirmation state. US-62: the confirmation is a ConfirmDialog; the trash button that
  // opened it gets the focus back when it closes (Escape / Cancel).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Compute individual attendance rates
  // US-39: `rate` is the colleague's Overall from the Bee-havior Hub (All time) — attended events in
  // their enrolled activities ÷ all events of those activities (US-31), via computeBeehavior so both
  // views share the math. null (no present at all) renders "—". `total`/`present` still count the
  // colleague's own records for "No attendance yet"; the "(x of N events)" beside the rate uses the
  // same Overall fraction as the tooltip, so both denominators match.
  const attendeeStats = useMemo(() => {
    const stats: Record<string, AttendeeStat> = {};

    const overallById = new Map(computeBeehavior(attendees, records, null).map(row => [row.attendee.id, row]));

    attendees.forEach(att => {
      const attLogs = records.filter(r => r.attendeeId === att.id);
      const total = attLogs.length;
      const present = attLogs.filter(r => r.status === "present").length;
      const row = overallById.get(att.id);
      stats[att.id] = {
        total,
        present,
        rate: row?.overallRate ?? null,
        overallPresents: row?.overallPresents ?? 0,
        overallTotal: row?.overallTotal ?? 0,
      };
    });

    return stats;
  }, [attendees, records]);

  // Filtered attendees list, A→Z by name (US-28) — sorted at render time so the order holds
  // after any search, filter, registration, import or check-in
  const filteredAttendees = useMemo(() => {
    return sortByName(attendees).filter(att => {
      const matchesSearch = att.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (att.email && att.email.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesActivity = selectedActivityFilter === "All" ||
                               records.some(r => r.attendeeId === att.id && r.activity === selectedActivityFilter);

      return matchesSearch && matchesActivity;
    });
  }, [attendees, records, searchQuery, selectedActivityFilter]);

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newName.trim()) return;

    onAddAttendee(newName.trim(), newEmail.trim(), newEnrolled);

    // Reset Form
    setNewName("");
    setNewEmail("");
    setNewEnrolled([]);
    setShowRegForm(false);

    // Confetti celebration!
    confetti({
      particleCount: 100,
      spread: 60,
      origin: { y: 0.8 },
      disableForReducedMotion: true
    });
  };

  const deletingAttendee = canEdit && deletingId ? attendees.find(a => a.id === deletingId) : undefined;

  // US-62: the table is a DataTable (it scrolls horizontally on its own; the name column stays pinned)
  const columns: DataTableColumn<Attendee>[] = [
    {
      key: "name",
      header: "Caserits",
      cell: att => (
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-wheat font-serif text-body font-bold text-forest"
          >
            {initials(att.name)}
          </div>
          <div>
            <p className="font-bold leading-tight text-forest">{att.name}</p>
            {att.email && (
              <p className="mt-0.5 flex items-center gap-1 text-micro font-medium text-text-muted">
                <Mail className="size-3" aria-hidden="true" />
                {att.email}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "rate",
      header: "Attendance Rate",
      cell: att => {
        const stat = attendeeStats[att.id] || NO_STAT;
        return (
          <div className="flex items-center gap-2">
            {/* US-42: the percentage carries no color scale — the Hive Status badge does */}
            <Badge title={stat.rate === null ? undefined : `Attended ${stat.overallPresents} of ${stat.overallTotal} events`}>
              {stat.total === 0 ? "No attendance yet" : stat.rate === null ? "—" : `${stat.rate}%`}
            </Badge>
            {stat.rate !== null && (
              <span className="font-mono text-micro font-medium text-text-muted">
                ({stat.overallPresents} of {pluralize(stat.overallTotal, "event")})
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Hive Status",
      // US-42: same Hive Status as the Bee-havior Hub (All time)
      cell: att => <TierBadge rate={(attendeeStats[att.id] || NO_STAT).rate} />,
    },
    {
      key: "joined",
      header: "Date Joined",
      cell: att => (
        <span className="flex items-center gap-1.5 font-mono text-micro font-medium text-text-muted">
          <Calendar className="size-3.5" aria-hidden="true" />
          {formatDisplayDate(att.joinedDate)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: att => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" icon={<FileBarChart2 className="size-3.5" />} onClick={() => onViewReport(att)}>
            Progress Report
          </Button>
          <IconButton
            icon={<Trash2 className="size-4" />}
            onClick={(e: { currentTarget: HTMLButtonElement }) => {
              deleteTriggerRef.current = e.currentTarget;
              setDeletingId(att.id);
            }}
            disabled={!canEdit}
            title="Delete Colleague"
            aria-label={`Delete ${att.name}`}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in" id="attendee-directory-tab">
      {!canEdit && <ReadOnlyNotice onSignIn={onSignIn} />}

      {/* Search and Action Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-panel border border-border bg-surface p-6 shadow-sm md:flex-row md:items-end">
        <div className="flex max-w-2xl flex-1 flex-col gap-3 sm:flex-row">
          {/* Search bar */}
          <Field label="Search colleagues" className="flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <Input
                type="text"
                placeholder="Search colleagues by name or email…"
                value={searchQuery}
                onChange={(e: { target: { value: string } }) => setSearchQuery(e.target.value)}
                className="pl-10 pr-11"
              />
              {searchQuery && (
                <IconButton
                  aria-label="Clear search"
                  icon={<X className="size-4" />}
                  onClick={() => setSearchQuery("")}
                  className="absolute top-0.5 right-0.5"
                />
              )}
            </div>
          </Field>

          {/* Activity Filter Dropdown */}
          <Field label="Filter by activity">
            <Select value={selectedActivityFilter} onChange={(e: { target: { value: string } }) => setSelectedActivityFilter(e.target.value)}>
              <option value="All">All Activities</option>
              {ACTIVITIES.map(act => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Manual Add Button */}
        <Button icon={<UserPlus className="size-4" />} onClick={() => setShowRegForm(!showRegForm)} disabled={!canEdit}>
          Add Colleague
        </Button>
      </div>

      {/* Register Form Modal Box */}
      {showRegForm && canEdit && (
        <div className="space-y-6 rounded-panel border border-border bg-surface p-8 shadow-sm animate-slide-down">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="flex items-center gap-2 font-serif text-h3 font-bold text-forest">
              <UserPlus className="size-5 text-text-muted" aria-hidden="true" />
              Add Colleague
            </h3>
            <IconButton aria-label="Cancel" icon={<X className="size-5" />} onClick={() => setShowRegForm(false)} />
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field label="Full Name" id="add-colleague-name">
                <Input
                  type="text"
                  required
                  placeholder="e.g. Elena Rostova"
                  value={newName}
                  onChange={(e: { target: { value: string } }) => setNewName(e.target.value)}
                />
              </Field>

              <Field label="Email Address (Optional)" id="add-colleague-email">
                <Input
                  type="email"
                  placeholder="e.g. elena@example.com"
                  value={newEmail}
                  onChange={(e: { target: { value: string } }) => setNewEmail(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-6">
              <Button variant="secondary" onClick={() => setShowRegForm(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Colleague</Button>
            </div>
          </form>
        </div>
      )}

      {/* Directory Table */}
      {filteredAttendees.length === 0 ? (
        <div className="space-y-3 rounded-panel border border-border bg-surface py-16 text-center shadow-sm">
          <p className="font-medium text-text-muted">{attendees.length === 0 ? "No colleagues yet." : "No colleagues match your search."}</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setSelectedActivityFilter("All");
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <DataTable
          caption="Caserits"
          hideCaption
          columns={columns}
          rows={filteredAttendees}
          getRowKey={att => att.id}
          stickyFirstColumn
        />
      )}

      {/* US-46: the confirmation names the colleague and says what else is deleted */}
      <ConfirmDialog
        open={!!deletingAttendee}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingAttendee) onRemoveAttendee(deletingAttendee.id);
          setDeletingId(null);
        }}
        title="Delete Colleague"
        objectName={deletingAttendee ? `Delete ${deletingAttendee.name}?` : ""}
        consequences="Their attendance records and coaching notes will also be deleted."
        confirmLabel="Delete"
        returnFocusRef={deleteTriggerRef}
      />
    </div>
  );
}
