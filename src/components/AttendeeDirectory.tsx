import { useState, useMemo, FormEvent } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import { Search, UserPlus, FileBarChart2, X, Check, Mail, Calendar, Settings, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";

interface AttendeeDirectoryProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onAddAttendee: (name: string, email: string, activities: string[]) => Attendee;
  onUpdateEnrollment: (attendeeId: string, activities: string[]) => void;
  onViewReport: (attendee: Attendee) => void;
  onRemoveAttendee: (id: string) => void;
}

export default function AttendeeDirectory({
  attendees,
  records,
  onAddAttendee,
  onUpdateEnrollment,
  onViewReport,
  onRemoveAttendee,
}: AttendeeDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedActivityFilter, setSelectedActivityFilter] = useState<string>("All");
  
  // Registration Form Toggle & State
  const [showRegForm, setShowRegForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newEnrolled, setNewEnrolled] = useState<string[]>([]);

  // Deletion confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Enrollment Editor Popover State
  // Keep track of which attendee is currently having their enrollments edited
  const [editingEnrollmentId, setEditingEnrollmentId] = useState<string | null>(null);

  // Compute individual attendance rates
  const attendeeStats = useMemo(() => {
    const stats: Record<string, { total: number; present: number; rate: number }> = {};
    
    attendees.forEach(att => {
      const attLogs = records.filter(r => r.attendeeId === att.id);
      const total = attLogs.length;
      const present = attLogs.filter(r => r.status === "present").length;
      const rate = total ? Math.round((present / total) * 100) : 0;
      stats[att.id] = { total, present, rate };
    });

    return stats;
  }, [attendees, records]);

  // Filtered attendees list
  const filteredAttendees = useMemo(() => {
    return attendees.filter(att => {
      const matchesSearch = att.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (att.email && att.email.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesActivity = selectedActivityFilter === "All" || 
                               records.some(r => r.attendeeId === att.id && r.activity === selectedActivityFilter);
      
      return matchesSearch && matchesActivity;
    });
  }, [attendees, records, searchQuery, selectedActivityFilter]);

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

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
      origin: { y: 0.8 }
    });
  };

  const handleToggleEnrollmentForm = (act: string) => {
    setNewEnrolled(prev =>
      prev.includes(act) ? prev.filter(a => a !== act) : [...prev, act]
    );
  };

  const handleToggleAttendeeEnrollment = (attendee: Attendee, activity: string) => {
    const isEnrolled = attendee.enrolledActivities.includes(activity);
    const nextActivities = isEnrolled
      ? attendee.enrolledActivities.filter(a => a !== activity)
      : [...attendee.enrolledActivities, activity];
    
    onUpdateEnrollment(attendee.id, nextActivities);
  };

  const getAttendanceBadgeClass = (rate: number, total: number) => {
    if (total === 0) return "bg-natural-cream text-natural-sage border border-natural-border/40";
    if (rate >= 90) return "bg-[#CCD5AE]/40 text-natural-forest font-bold border border-[#CCD5AE]/80";
    if (rate >= 75) return "bg-natural-wheat text-natural-forest font-bold border border-natural-border/60";
    return "bg-natural-sand/15 text-natural-sand font-bold border border-natural-sand/35";
  };

  return (
    <div className="space-y-8 animate-fade-in" id="attendee-directory-tab">
      {/* Search and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-[24px] border border-natural-border p-6 shadow-sm">
        <div className="flex flex-1 flex-col sm:flex-row gap-3 max-w-2xl">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-natural-sage" />
            <input
              type="text"
              placeholder="Search colleagues by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-natural-cream/20 border border-natural-border rounded-xl pl-11 pr-4 py-2.5 text-sm text-natural-forest placeholder-natural-sage/70 focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150"
            />
          </div>

          {/* Activity Filter Dropdown */}
          <select
            value={selectedActivityFilter}
            onChange={(e) => setSelectedActivityFilter(e.target.value)}
            className="bg-natural-cream/20 border border-natural-border rounded-xl px-4 py-2.5 text-sm text-natural-forest font-medium focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150"
          >
            <option value="All">All Activities</option>
            {ACTIVITIES.map(act => (
              <option key={act} value={act}>
                {act.replace("English ", "")}
              </option>
            ))}
          </select>
        </div>

        {/* Manual Add Button */}
        <button
          type="button"
          onClick={() => setShowRegForm(!showRegForm)}
          className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] text-white font-serif font-semibold px-5 py-3 rounded-xl text-sm transition duration-150 shadow-md"
        >
          <UserPlus className="h-4 w-4" />
          <span>Register New Colleague</span>
        </button>
      </div>

      {/* Register Form Modal Box */}
      {showRegForm && (
        <div className="bg-white rounded-[32px] border border-natural-border p-8 shadow-sm space-y-6 animate-slide-down">
          <div className="flex justify-between items-center border-b border-natural-border pb-4">
            <h3 className="font-serif font-bold text-natural-forest text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-natural-sage" />
              Add Colleague to Directory
            </h3>
            <button
              type="button"
              onClick={() => setShowRegForm(false)}
              className="text-natural-sage hover:text-natural-forest"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Elena Rostova"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-natural-cream/20 border border-natural-border rounded-xl px-4 py-3 text-sm text-natural-forest focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. elena@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-natural-cream/20 border border-natural-border rounded-xl px-4 py-3 text-sm text-natural-forest focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-natural-border pt-6">
              <button
                type="button"
                onClick={() => setShowRegForm(false)}
                className="px-6 py-2.5 border border-natural-border text-natural-forest/70 hover:bg-natural-cream text-sm font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-natural-forest hover:bg-[#213028] text-white text-sm font-bold rounded-xl transition shadow-sm"
              >
                Register Colleague
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-[32px] border border-natural-border shadow-sm overflow-hidden">
        {filteredAttendees.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-natural-sage font-medium">No attendees match your search filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedActivityFilter("All");
              }}
              className="text-xs font-bold text-natural-forest hover:underline"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-natural-cream/40 border-b border-natural-border text-natural-sage text-xs font-bold uppercase">
                  <th className="p-4 pl-6">Caserits</th>
                  <th className="p-4">Attendance Rate</th>
                  <th className="p-4">Date Joined</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-natural-border/60 text-sm text-natural-forest">
                {filteredAttendees.map(att => {
                  const stat = attendeeStats[att.id] || { total: 0, present: 0, rate: 0 };

                  return (
                    <tr key={att.id} className="hover:bg-natural-cream/10 transition">
                      {/* Name Card */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 rounded-full bg-natural-wheat/60 text-natural-forest flex items-center justify-center font-serif font-bold text-sm border border-natural-border/60">
                            {att.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div>
                            <h4 className="font-bold text-[#1A1A1A] text-sm leading-tight">{att.name}</h4>
                            {att.email && (
                              <p className="text-xs text-natural-sage flex items-center gap-1 mt-0.5 font-medium">
                                <Mail className="h-3 w-3" />
                                {att.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Attendance Stats badge */}
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getAttendanceBadgeClass(stat.rate, stat.total)}`}>
                            {stat.total === 0 ? "No Logs" : `${stat.rate}%`}
                          </span>
                          {stat.total > 0 && (
                            <span className="text-xs text-natural-sage font-mono font-medium">
                              ({stat.present}/{stat.total} days)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Joined Date */}
                      <td className="p-4 text-xs font-mono text-natural-sage font-medium">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-natural-sage/75" />
                          {att.joinedDate}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onViewReport(att)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-natural-wheat hover:bg-natural-wheat/80 text-natural-forest font-serif font-bold text-xs rounded-xl border border-natural-border/30 transition shadow-sm"
                          >
                            <FileBarChart2 className="h-3.5 w-3.5" />
                            <span>Progress Report</span>
                          </button>

                          {deletingId === att.id ? (
                            <div className="inline-flex items-center gap-1 animate-fade-in">
                              <button
                                type="button"
                                onClick={() => {
                                  onRemoveAttendee(att.id);
                                  setDeletingId(null);
                                }}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingId(att.id)}
                              className="p-2 text-natural-sand/75 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                              title="Remove Colleague"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
