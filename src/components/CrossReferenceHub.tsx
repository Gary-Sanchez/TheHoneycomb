import { useState, useMemo } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import { Check, Users, ShieldAlert, Award, FileSpreadsheet, ArrowRightLeft, Sparkles } from "lucide-react";

interface CrossReferenceHubProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onNavigateToAttendee: (attendee: Attendee) => void;
}

export default function CrossReferenceHub({ attendees, records, onNavigateToAttendee }: CrossReferenceHubProps) {
  const [overlapFilter, setOverlapFilter] = useState<"all" | "single" | "multi" | "super">("all");
  
  // Custom Cross-Referencing Overlap Analyzer States
  const [compareAct1, setCompareAct1] = useState<string>(ACTIVITIES[0]);
  const [compareAct2, setCompareAct2] = useState<string>(ACTIVITIES[1]);

  // Compute a map of attendee ID to the unique list of activities they have attended
  const attendeeActivitiesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    attendees.forEach(a => {
      map[a.id] = [];
    });
    records.forEach(r => {
      if (map[r.attendeeId] && !map[r.attendeeId].includes(r.activity)) {
        map[r.attendeeId].push(r.activity);
      }
    });
    return map;
  }, [attendees, records]);

  // Calculations for Multi-Enrollment Analytics based on active participation
  const stats = useMemo(() => {
    const total = attendees.length;
    if (total === 0) return { single: 0, multi: 0, super: 0 };
    
    let single = 0;
    let multi = 0; // 2+
    let superAct = 0; // 3+

    attendees.forEach(a => {
      const count = (attendeeActivitiesMap[a.id] || []).length;
      if (count === 1) single++;
      if (count >= 2) multi++;
      if (count >= 3) superAct++;
    });

    return { single, multi, super: superAct };
  }, [attendees, attendeeActivitiesMap]);

  // Filter attendees list based on overlap count
  const filteredAttendees = useMemo(() => {
    return attendees.filter(a => {
      const count = (attendeeActivitiesMap[a.id] || []).length;
      if (overlapFilter === "single") return count === 1;
      if (overlapFilter === "multi") return count >= 2;
      if (overlapFilter === "super") return count >= 3;
      return true; // "all"
    });
  }, [attendees, attendeeActivitiesMap, overlapFilter]);

  // Overlap Intersection between Selected Activities
  const intersectingAttendees = useMemo(() => {
    if (compareAct1 === compareAct2) return [];
    return attendees.filter(a => {
      const acts = attendeeActivitiesMap[a.id] || [];
      return acts.includes(compareAct1) && acts.includes(compareAct2);
    });
  }, [attendees, attendeeActivitiesMap, compareAct1, compareAct2]);

  // Automatic semantic insights
  const semanticInsights = useMemo(() => {
    const insights: string[] = [];

    // Let's check overlap percentages
    ACTIVITIES.forEach((act1, i) => {
      ACTIVITIES.forEach((act2, j) => {
        if (i >= j) return; // Avoid duplicate pairs
        const totalAct1 = attendees.filter(a => (attendeeActivitiesMap[a.id] || []).includes(act1)).length;
        if (totalAct1 === 0) return;

        const shared = attendees.filter(a => {
          const acts = attendeeActivitiesMap[a.id] || [];
          return acts.includes(act1) && acts.includes(act2);
        }).length;

        const rate = Math.round((shared / totalAct1) * 100);
        if (rate >= 30 && shared > 0) {
          insights.push(
            `💡 High Overlap: ${rate}% of colleagues in "${act1.replace("English ", "")}" also attend "${act2.replace("English ", "")}" (${shared} shared colleagues).`
          );
        }
      });
    });

    if (stats.super > 0) {
      insights.push(
        `🏆 Highly Active: We have ${stats.super} colleagues participating in 3 or more English activities simultaneously, showing great dedication.`
      );
    }

    if (insights.length === 0) {
      insights.push("✏️ No major activity overlap trends detected yet. Log more sessions to extract participation patterns!");
    }

    return insights;
  }, [attendees, stats, attendeeActivitiesMap]);

  return (
    <div className="space-y-8 animate-fade-in" id="cross-ref-tab">
      
      {/* Top row: Multi-activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Single Activity */}
        <div className="bg-white rounded-[32px] p-6 border border-[#E9E5D9] shadow-sm flex items-center space-x-5 hover:border-natural-sage transition duration-300">
          <div className="p-4 bg-natural-cream text-natural-sage rounded-2xl border border-natural-border/40">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-sage font-bold mb-1">Single Activity Only</p>
            <h3 className="text-4xl font-serif font-bold text-[#1A1A1A] tracking-tight">{stats.single}</h3>
            <span className="text-xs text-natural-sage font-semibold">Participating in one activity</span>
          </div>
        </div>

        {/* Multi Activity (2+) */}
        <div className="bg-white rounded-[32px] p-6 border border-[#E9E5D9] shadow-sm flex items-center space-x-5 hover:border-natural-sand transition duration-300">
          <div className="p-4 bg-natural-wheat text-natural-sand rounded-2xl border border-natural-border/30">
            <ArrowRightLeft className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-sand font-bold mb-1">Multi-Activity Overlap</p>
            <h3 className="text-4xl font-serif font-bold text-[#1A1A1A] tracking-tight">{stats.multi}</h3>
            <span className="text-xs text-natural-sand font-semibold">Active in 2+ activities</span>
          </div>
        </div>

        {/* Super Active (3+) */}
        <div className="bg-white rounded-[32px] p-6 border border-[#E9E5D9] shadow-sm flex items-center space-x-5 hover:border-natural-forest transition duration-300">
          <div className="p-4 bg-[#CCD5AE]/40 text-natural-forest rounded-2xl border border-[#CCD5AE]/60">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[#8A9A5B] font-bold mb-1">Super Active Overlap</p>
            <h3 className="text-4xl font-serif font-bold text-natural-forest tracking-tight">{stats.super}</h3>
            <span className="text-xs text-[#8A9A5B] font-semibold">Active in 3+ activities</span>
          </div>
        </div>

      </div>

      {/* Main Interactive Analyzer & Semantic Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Interactive Compare Tool Card */}
        <div className="lg:col-span-2 bg-gradient-to-br from-[#2D3E35] to-[#1E2923] text-natural-cream rounded-[32px] p-6 shadow-md border border-[#E9E5D9]/25 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#CCD5AE]" />
              <h3 className="text-lg font-serif font-bold text-white">Interactive Overlap Cross-Referencer</h3>
            </div>
            <p className="text-xs text-natural-wheat/80 leading-relaxed">
              Select any two English activities to find the exact cohort of colleagues who have logged attendance in both. Ideal for understanding social overlaps and optimizing company activity calendars.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#CCD5AE] tracking-wider">First Activity</label>
                <select
                  value={compareAct1}
                  onChange={(e) => setCompareAct1(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-natural-sage/50"
                >
                  {ACTIVITIES.map(act => (
                    <option key={act} value={act} className="text-natural-forest font-medium">
                      {act}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#CCD5AE] tracking-wider">Second Activity</label>
                <select
                  value={compareAct2}
                  onChange={(e) => setCompareAct2(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-natural-sage/50"
                >
                  {ACTIVITIES.map(act => (
                    <option key={act} value={act} className="text-natural-forest font-medium">
                      {act}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
            <h4 className="text-xs font-bold text-[#CCD5AE] uppercase tracking-widest">
              Shared Colleague Cohort ({intersectingAttendees.length})
            </h4>

            {compareAct1 === compareAct2 ? (
              <p className="text-xs text-natural-wheat/65 italic">Please select two different activities to cross reference.</p>
            ) : intersectingAttendees.length === 0 ? (
              <p className="text-xs text-natural-wheat/65 italic">No colleagues have registered attendance in both activities yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                {intersectingAttendees.map(att => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => onNavigateToAttendee(att)}
                    className="bg-white/10 hover:bg-white/20 border border-white/20 text-[#FDFBF7] rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Check className="h-3.5 w-3.5 text-[#CCD5AE] stroke-[3]" />
                    <span>{att.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Automatic Overlap Insights Sidebar */}
        <div className="bg-natural-cream/30 border border-natural-border rounded-[32px] p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-natural-sage uppercase tracking-widest">
              Automated Activity Insights
            </h4>
            
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {semanticInsights.map((insight, idx) => (
                <div key={idx} className="bg-white border border-natural-border/60 p-4 rounded-xl text-xs text-natural-forest leading-relaxed shadow-sm">
                  {insight}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Roster Grid / Overlap Matrix */}
      <div className="space-y-4">
        
        {/* Title and Filter Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-serif font-bold text-natural-forest">Participation Matrix Directory</h3>
            <p className="text-xs text-natural-sage font-medium">Total cross-referenced colleague participation breakdown</p>
          </div>

          {/* Filtering buttons */}
          <div className="flex bg-natural-wheat/40 border border-natural-border/40 p-1 rounded-xl text-xs font-semibold text-natural-forest self-start">
            <button
              type="button"
              onClick={() => setOverlapFilter("all")}
              className={`px-3 py-2 rounded-lg transition duration-150 ${
                overlapFilter === "all" ? "bg-white text-natural-forest shadow-sm border border-natural-border/40" : "hover:text-natural-forest text-natural-sage"
              }`}
            >
              All ({attendees.length})
            </button>
            <button
              type="button"
              onClick={() => setOverlapFilter("single")}
              className={`px-3 py-2 rounded-lg transition duration-150 ${
                overlapFilter === "single" ? "bg-white text-natural-forest shadow-sm border border-natural-border/40" : "hover:text-natural-forest text-natural-sage"
              }`}
            >
              Single ({stats.single})
            </button>
            <button
              type="button"
              onClick={() => setOverlapFilter("multi")}
              className={`px-3 py-2 rounded-lg transition duration-150 ${
                overlapFilter === "multi" ? "bg-white text-natural-forest shadow-sm border border-natural-border/40" : "hover:text-natural-forest text-natural-sage"
              }`}
            >
              Overlap (2+) ({stats.multi})
            </button>
            <button
              type="button"
              onClick={() => setOverlapFilter("super")}
              className={`px-3 py-2 rounded-lg transition duration-150 ${
                overlapFilter === "super" ? "bg-white text-natural-forest shadow-sm border border-natural-border/40" : "hover:text-natural-forest text-natural-sage"
              }`}
            >
              Super ({stats.super})
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="bg-white rounded-[32px] border border-natural-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-natural-cream/40 border-b border-natural-border text-natural-sage text-xs font-bold uppercase">
                  <th className="p-4 pl-6">Colleague Name</th>
                  {ACTIVITIES.map(act => (
                    <th key={act} className="p-4 text-center max-w-[150px] truncate">
                      {act.replace("English ", "")}
                    </th>
                  ))}
                  <th className="p-4 text-center">Total Activities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-natural-border/60 text-sm text-natural-forest">
                {filteredAttendees.map(att => {
                  const numActivities = (attendeeActivitiesMap[att.id] || []).length;
                  return (
                    <tr key={att.id} className="hover:bg-natural-cream/10 transition">
                      
                      {/* Name with Overlap Badge */}
                      <td className="p-4 pl-6 font-bold text-[#1A1A1A]">
                        <div className="flex items-center space-x-2">
                          <span>{att.name}</span>
                          {numActivities >= 3 ? (
                            <span className="text-[9px] uppercase font-black tracking-widest bg-natural-forest text-natural-cream border border-natural-forest/30 px-1.5 py-0.5 rounded">
                              Super
                            </span>
                          ) : numActivities >= 2 ? (
                            <span className="text-[9px] uppercase font-black tracking-widest bg-natural-wheat text-natural-sand border border-natural-border/60 px-1.5 py-0.5 rounded">
                              Overlap
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Columns for the 4 Activities */}
                      {ACTIVITIES.map(act => {
                        const isParticipating = (attendeeActivitiesMap[att.id] || []).includes(act);
                        return (
                          <td key={act} className="p-4 text-center">
                            <div className="flex justify-center">
                              {isParticipating ? (
                                <div className="h-6 w-6 rounded-full bg-natural-cream border border-natural-border text-natural-sage flex items-center justify-center font-bold">
                                  <Check className="h-4 w-4 stroke-[3.5]" />
                                </div>
                              ) : (
                                <span className="text-natural-wheat font-black">—</span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Number of activities badges */}
                      <td className="p-4 text-center font-bold">
                        <span className={`inline-block h-7 w-7 rounded-full leading-7 text-center text-xs font-bold ${
                          numActivities >= 3 ? "bg-natural-forest text-white" :
                          numActivities >= 2 ? "bg-natural-sand text-white" : "bg-natural-cream text-natural-sage border border-natural-border/40"
                        }`}>
                          {numActivities}
                        </span>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
