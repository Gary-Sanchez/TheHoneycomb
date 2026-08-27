import { useState, useMemo, FormEvent } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES, ActivityType } from "../types";
import { Calendar, Check, X, UserPlus, AlertCircle, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

interface AttendanceLoggerProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onAddAttendee: (name: string, email: string, activities: string[]) => Attendee;
  onSaveRecords: (newRecords: Omit<AttendanceRecord, "id">[]) => void;
}

export default function AttendanceLogger({
  attendees,
  records,
  onAddAttendee,
  onSaveRecords,
}: AttendanceLoggerProps) {
  const todayStr = "2026-06-24"; // Preset date reflecting system time
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType>(ACTIVITIES[0]);

  // Track present/absent statuses for enrolled attendees
  // Key: attendeeId, Value: "present" | "absent" | undefined
  const [statuses, setStatuses] = useState<Record<string, "present" | "absent">>({});

  // Quick Add Attendee States
  const [quickName, setQuickName] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // All employees are eligible for check-in since participation is voluntary
  const enrolledAttendees = useMemo(() => {
    return attendees;
  }, [attendees]);

  // Inline quick-introduce state
  const [inlineName, setInlineName] = useState("");

  const handleInlineSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inlineName.trim()) return;

    // Add attendee with empty enrolled list since they are all colleagues of the company
    const newAtt = onAddAttendee(inlineName.trim(), "", []);
    
    // Default their status to present in the form state
    setStatuses(prev => ({
      ...prev,
      [newAtt.id]: "present",
    }));

    setInlineName("");
    
    // Blast confetti!
    confetti({
      particleCount: 50,
      spread: 40,
      origin: { y: 0.8 }
    });

    setSuccessMsg(`Successfully registered and checked in ${newAtt.name}!`);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  // Check if there are already records logged for this date and activity
  const existingRecords = useMemo(() => {
    return records.filter(r => r.date === selectedDate && r.activity === selectedActivity);
  }, [records, selectedDate, selectedActivity]);

  // Set default status (Present) for anyone not configured in statuses
  const getStatus = (attendeeId: string) => {
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

  const handleToggleStatus = (attendeeId: string, status: "present" | "absent") => {
    setStatuses(prev => ({
      ...prev,
      [attendeeId]: status,
    }));
  };

  const handleMarkAll = (status: "present" | "absent") => {
    const nextStatuses: Record<string, "present" | "absent"> = {};
    enrolledAttendees.forEach(att => {
      nextStatuses[att.id] = status;
    });
    setStatuses(nextStatuses);
  };

  const handleQuickAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;

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
      origin: { y: 0.8 }
    });

    setSuccessMsg(`Successfully added ${newAtt.name} to the directory!`);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleSave = () => {
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
      origin: { y: 0.8 }
    });

    setSuccessMsg(`Attendance saved successfully for ${selectedActivity} on ${selectedDate}!`);
    setStatuses({}); // Clear status buffer
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  return (
    <div className="bg-white rounded-[32px] border border-natural-border p-8 shadow-sm space-y-8 animate-fade-in" id="attendance-logger-tab">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-natural-border pb-6">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1A1A1A]">Log Session Attendance</h2>
          <p className="text-sm text-natural-sage font-medium">Select date and activity to check in attendees</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Mark All Buttons */}
          {enrolledAttendees.length > 0 && (
            <div className="flex items-center bg-natural-wheat/40 border border-natural-border/40 rounded-xl p-1 text-xs font-semibold text-natural-forest">
              <button
                type="button"
                onClick={() => handleMarkAll("present")}
                className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-natural-sage transition duration-150"
              >
                All Present
              </button>
              <button
                type="button"
                onClick={() => handleMarkAll("absent")}
                className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-natural-sand transition duration-150"
              >
                All Absent
              </button>
            </div>
          )}

          {/* Quick Add Button */}
          <button
            type="button"
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className="flex items-center gap-1.5 bg-natural-wheat border border-natural-border/40 hover:bg-natural-wheat/80 text-natural-forest font-semibold px-4 py-2 rounded-xl text-sm transition duration-150"
          >
            <UserPlus className="h-4 w-4 text-natural-sage" />
            <span>Quick Add Colleague</span>
          </button>
        </div>
      </div>

      {/* Success/Notification messages */}
      {successMsg && (
        <div className="bg-[#CCD5AE]/20 border border-[#CCD5AE]/60 text-natural-forest px-4 py-3 rounded-xl text-sm flex items-center space-x-2 animate-bounce-subtle">
          <Sparkles className="h-4 w-4 text-natural-sage shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* Configuration Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-natural-cream/60 p-6 rounded-[24px] border border-natural-border">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-natural-sage" />
            Session Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setStatuses({});
            }}
            className="w-full bg-white border border-natural-border rounded-xl px-4 py-3 text-natural-forest font-medium focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">Activity</label>
          <select
            value={selectedActivity}
            onChange={(e) => {
              setSelectedActivity(e.target.value as ActivityType);
              setStatuses({});
            }}
            className="w-full bg-white border border-natural-border rounded-xl px-4 py-3 text-natural-forest font-medium focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150"
          >
            {ACTIVITIES.map(act => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inline Introduce New Colleague */}
      <form onSubmit={handleInlineSubmit} className="bg-natural-wheat/20 border border-[#CCD5AE]/40 p-5 rounded-[24px] space-y-3 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-natural-forest flex items-center gap-1.5">
          <UserPlus className="h-4 w-4 text-natural-sage" />
          Introduce and Check In a New Name
        </h3>
        <p className="text-xs text-natural-sage font-medium">
          Type a colleague's name to instantly register them in the directory and mark them as <strong>Present</strong> for this activity.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Introduce new name (e.g. Fabiola Arias)..."
            value={inlineName}
            onChange={(e) => setInlineName(e.target.value)}
            className="flex-1 bg-white border border-natural-border rounded-xl px-4 py-2.5 text-natural-forest text-sm focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage font-medium placeholder-natural-sage/50"
          />
          <button
            type="submit"
            className="bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold px-6 py-2.5 rounded-xl text-xs transition duration-150 shadow-sm"
          >
            Add & Check In
          </button>
        </div>
      </form>

      {/* Quick Add Form Modal/Section */}
      {showQuickAdd && (
        <form onSubmit={handleQuickAddSubmit} className="bg-natural-wheat/10 border border-natural-border p-6 rounded-[24px] space-y-4 animate-slide-down">
          <div className="flex justify-between items-center">
            <h3 className="font-serif font-bold text-natural-forest flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-natural-sage" />
              Quick Register New Colleague
            </h3>
            <button
              type="button"
              onClick={() => setShowQuickAdd(false)}
              className="text-natural-sage hover:text-natural-forest"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-natural-forest/70">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Jean Dupont"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                className="w-full bg-white border border-natural-border/85 rounded-xl px-3 py-2 text-natural-forest text-sm focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-natural-forest/70">Email Address (Optional)</label>
              <input
                type="email"
                placeholder="e.g. jean@example.com"
                value={quickEmail}
                onChange={(e) => setQuickEmail(e.target.value)}
                className="w-full bg-white border border-natural-border/85 rounded-xl px-3 py-2 text-natural-forest text-sm focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowQuickAdd(false)}
              className="px-4 py-2 text-xs font-bold text-natural-forest/60 hover:text-natural-forest hover:bg-natural-cream rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-natural-forest hover:bg-[#213028] text-white text-xs font-bold rounded-xl transition"
            >
              Register Colleague
            </button>
          </div>
        </form>
      )}

      {/* Roster / Attendee Checklist */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-serif font-bold text-natural-forest">
            Active Attendance List ({enrolledAttendees.length})
          </h3>
          {existingRecords.length > 0 && (
            <span className="text-xs font-semibold bg-[#FAEDCD]/40 text-natural-sand border border-[#D4A373]/30 px-3 py-1 rounded-full flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-natural-sand" />
              Existing entries for this day will be updated
            </span>
          )}
        </div>

        {enrolledAttendees.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-natural-border rounded-[24px] bg-natural-cream/30 space-y-3">
            <p className="text-natural-sage font-medium">No colleagues are currently registered in the database.</p>
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="inline-flex items-center gap-1 bg-natural-forest hover:bg-[#213028] text-white text-xs font-bold px-4 py-2 rounded-xl transition duration-150"
            >
              <UserPlus className="h-3.5 w-3.5" /> Register First Colleague
            </button>
          </div>
        ) : (
          <div className="border border-natural-border rounded-[24px] overflow-hidden divide-y divide-natural-border/60 shadow-inner bg-natural-cream/10 max-h-[500px] overflow-y-auto">
            {enrolledAttendees.map(att => {
              const currentStatus = getStatus(att.id);
              return (
                <div key={att.id} className="flex items-center justify-between p-4 bg-white hover:bg-natural-cream/30 transition">
                  <div>
                    <h4 className="font-bold text-[#1A1A1A] text-sm leading-tight">{att.name}</h4>
                    <p className="text-xs text-natural-sage font-mono mt-0.5">{att.email || "No email registered"}</p>
                  </div>

                  {/* Attendance Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(att.id, "present")}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition duration-150 ${
                        currentStatus === "present"
                          ? "bg-natural-sage text-white shadow-sm shadow-natural-sage/10"
                          : "bg-natural-cream text-natural-forest/60 border border-natural-border/40 hover:bg-natural-wheat"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Present</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(att.id, "absent")}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition duration-150 ${
                        currentStatus === "absent"
                          ? "bg-natural-sand text-white shadow-sm"
                          : "bg-natural-cream text-natural-forest/60 border border-natural-border/40 hover:bg-natural-wheat"
                      }`}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Absent</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Button */}
      {enrolledAttendees.length > 0 && (
        <div className="flex justify-end pt-4 border-t border-natural-border">
          <button
            type="button"
            onClick={handleSave}
            className="bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold px-8 py-3 rounded-xl text-sm shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition duration-150"
          >
            Save Attendance Records
          </button>
        </div>
      )}
    </div>
  );
}
