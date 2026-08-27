import { useState, useMemo } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import { X, Calendar, CheckCircle, XCircle, Award, AwardIcon, MessageSquare, Plus, Save, BookOpen } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface ProgressReportModalProps {
  attendee: Attendee;
  records: AttendanceRecord[];
  notes?: string;
  onClose: () => void;
  onSaveNotes: (attendeeId: string, notes: string) => void;
}

export default function ProgressReportModal({
  attendee,
  records,
  notes = "",
  onClose,
  onSaveNotes,
}: ProgressReportModalProps) {
  const [teacherNotes, setTeacherNotes] = useState(notes);
  const [isSaved, setIsSaved] = useState(false);

  // 1. Gather all logs for this attendee, sorted chronologically descending (newest first)
  const attLogs = useMemo(() => {
    return records
      .filter(r => r.attendeeId === attendee.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [records, attendee]);

  // 2. Calculations
  const totalLogs = attLogs.length;
  const presentLogs = attLogs.filter(r => r.status === "present").length;
  const absentLogs = totalLogs - presentLogs;
  const rate = totalLogs ? Math.round((presentLogs / totalLogs) * 100) : 0;

  // 3. Activity specific breakdown across all core activities
  const activityBreakdown = useMemo(() => {
    return ACTIVITIES.map(act => {
      const logs = attLogs.filter(r => r.activity === act);
      const total = logs.length;
      const presents = logs.filter(r => r.status === "present").length;
      const actRate = total ? Math.round((presents / total) * 100) : 0;
      return {
        activity: act,
        total,
        presents,
        absents: total - presents,
        rate: actRate,
      };
    });
  }, [attLogs]);

  // 4. Monthly Trend for this colleague
  const monthlyData = useMemo(() => {
    const months = ["04", "05", "06"];
    const monthNames = { "04": "April", "05": "May", "06": "June" };

    return months.map(m => {
      const monthLogs = attLogs.filter(r => r.date.split("-")[1] === m);
      const total = monthLogs.length;
      const presents = monthLogs.filter(r => r.status === "present").length;
      const rateVal = total ? Math.round((presents / total) * 100) : 0;

      return {
        month: monthNames[m as keyof typeof monthNames],
        "Attendance (%)": rateVal,
      };
    });
  }, [attLogs]);

  // 5. Generate progress status text
  const progressStatus = useMemo(() => {
    if (totalLogs === 0) return { title: "Unlogged", color: "text-natural-sage bg-natural-cream/40", desc: "No attendance recorded yet." };
    if (rate >= 90) return { title: "Excellent Performance", color: "text-natural-forest bg-[#CCD5AE]/30", desc: "Demonstrating consistent engagement and participation." };
    if (rate >= 75) return { title: "Good Standing", color: "text-natural-sand bg-natural-wheat/40", desc: "Steady participation. Keeps pace with activities nicely." };
    return { title: "Needs Support", color: "text-natural-sand bg-[#E9E5D9]/50", desc: "Recommend direct outreach or follow-up email to re-engage." };
  }, [rate, totalLogs]);

  const handleSaveNotes = () => {
    onSaveNotes(attendee.id, teacherNotes);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="fixed inset-0 bg-[#2D3E35]/45 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="progress-report-modal">
      <div className="bg-[#FDFBF7] rounded-[32px] border border-natural-border shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-6 border-b border-natural-border flex justify-between items-center bg-natural-cream/40">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-natural-forest text-natural-cream flex items-center justify-center font-serif font-bold text-lg shadow-md border border-[#CCD5AE]/40">
              {attendee.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div>
              <h3 className="font-serif font-bold text-[#1A1A1A] text-xl leading-tight">{attendee.name}</h3>
              <p className="text-xs text-natural-sage font-mono mt-0.5">{attendee.email || "No email registered"}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-natural-sage hover:text-natural-forest hover:bg-natural-cream rounded-xl transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          
          {/* Top Row Grid: KPI, Trend Chart, Activities breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* KPI Column */}
            <div className="space-y-4">
              <div className="bg-natural-cream/30 rounded-[24px] p-5 border border-natural-border/60 flex flex-col justify-between h-full">
                <div>
                  <h4 className="text-xs font-bold text-natural-sage uppercase tracking-wider">Overall Engagement</h4>
                  <div className="flex items-baseline space-x-2 mt-4">
                    <span className="text-5xl font-serif font-bold text-[#1A1A1A]">{totalLogs === 0 ? "—" : `${rate}%`}</span>
                    {totalLogs > 0 && <span className="text-xs text-natural-sage font-bold">Present Rate</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs text-natural-sage font-semibold border-t border-natural-border/60 pt-3 mt-4">
                    <span>Present: <strong className="text-natural-forest">{presentLogs}</strong></span>
                    <span>Absent: <strong className="text-natural-sand">{absentLogs}</strong></span>
                    <span>Total Logs: <strong>{totalLogs}</strong></span>
                  </div>
                </div>

                <div className={`mt-5 p-3 rounded-xl border ${progressStatus.color} border-current/10`}>
                  <p className="font-bold text-xs leading-none">{progressStatus.title}</p>
                  <p className="text-[11px] leading-tight mt-1 opacity-90">{progressStatus.desc}</p>
                </div>
              </div>
            </div>

            {/* Attendance Chart Column */}
            <div className="md:col-span-2 bg-natural-cream/30 rounded-[24px] p-5 border border-natural-border/60">
              <h4 className="text-xs font-bold text-natural-sage uppercase tracking-wider mb-4">Monthly Trends Progress</h4>
              {totalLogs === 0 ? (
                <div className="h-[140px] flex items-center justify-center text-xs text-natural-sage italic font-medium">
                  No attendance records logged yet
                </div>
              ) : (
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E5D9" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#6B7F60", fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#6B7F60", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#2D3E35",
                          borderRadius: "12px",
                          border: "none",
                          color: "#FDFBF7",
                          fontSize: "11px",
                        }}
                      />
                      <Bar dataKey="Attendance (%)" fill="#8A9A5B" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Activity Breakdown Matrix */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-natural-sage uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-natural-sage" />
              Activity Engagement Breakdown
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activityBreakdown.map(bd => (
                <div key={bd.activity} className="border border-natural-border rounded-[20px] p-4 bg-white hover:border-natural-sage transition">
                  <div className="flex justify-between items-start">
                    <h5 className="font-serif font-bold text-[#1A1A1A] text-sm">{bd.activity}</h5>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      bd.total === 0 ? "bg-natural-cream text-natural-sage" :
                      bd.rate >= 90 ? "bg-[#CCD5AE]/40 text-natural-forest" :
                      bd.rate >= 75 ? "bg-natural-wheat text-natural-sand" : "bg-[#E9E5D9] text-natural-sand"
                    }`}>
                      {bd.total === 0 ? "No Logs" : `${bd.rate}%`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 text-center border-t border-natural-border/60 pt-3 text-[11px] text-[#1A1A1A]">
                    <div>
                      <p className="text-natural-sage font-medium">Presents</p>
                      <p className="font-bold text-natural-forest mt-0.5">{bd.presents}</p>
                    </div>
                    <div>
                      <p className="text-natural-sage font-medium">Absents</p>
                      <p className="font-bold text-natural-sand mt-0.5">{bd.absents}</p>
                    </div>
                    <div>
                      <p className="text-natural-sage font-medium">Total logged</p>
                      <p className="font-bold text-natural-forest mt-0.5">{bd.total}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Grid: Historical logs & Coaching notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-natural-border pt-8">
            
            {/* Left Column: Coaching Notes */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-natural-sage uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-natural-sage" />
                Coaching Progress Notes
              </h4>
              <div className="space-y-3">
                <textarea
                  value={teacherNotes}
                  onChange={(e) => {
                    setTeacherNotes(e.target.value);
                    if (isSaved) setIsSaved(false);
                  }}
                  placeholder="Record learning milestones, speaking progress, pronunciation issues, or assignment submissions here..."
                  rows={6}
                  className="w-full bg-white border border-natural-border rounded-xl p-4 text-sm text-natural-forest placeholder-natural-sage/75 focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150 resize-none font-medium"
                />
                
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-natural-sage font-bold">Notes are saved locally on this device.</span>
                  
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg transition ${
                      isSaved
                        ? "bg-[#556B2F] text-white"
                        : "bg-natural-forest hover:bg-[#213028] text-white border border-natural-forest/30"
                    }`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{isSaved ? "Saved" : "Save Notes"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Historical Logs */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-natural-sage uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-natural-sage" />
                Session History Log
              </h4>

              {attLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-natural-sage italic border border-dashed border-natural-border rounded-xl font-medium">
                  No attendance logged yet.
                </div>
              ) : (
                <div className="border border-natural-border rounded-[20px] overflow-hidden shadow-inner max-h-[220px] overflow-y-auto divide-y divide-natural-border/60">
                  {attLogs.map(log => (
                    <div key={log.id} className="flex justify-between items-center p-3 bg-white text-xs hover:bg-natural-cream/30">
                      <div>
                        <p className="font-bold text-[#1A1A1A]">{log.activity.replace("English ", "")}</p>
                        <p className="text-[10px] text-natural-sage font-mono mt-0.5">{log.date}</p>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${
                        log.status === "present"
                          ? "bg-[#CCD5AE]/40 text-natural-forest border border-[#CCD5AE]/80"
                          : "bg-natural-sand/15 text-natural-sand border border-natural-sand/35"
                      }`}>
                        {log.status === "present" ? (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            <span>Present</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" />
                            <span>Absent</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-natural-cream/40 border-t border-natural-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-natural-forest hover:bg-[#213028] text-white font-serif font-bold text-xs rounded-xl shadow-md transition"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
