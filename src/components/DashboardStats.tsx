import { useState, useMemo } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Users, FileText, CheckCircle2, Award, ArrowUpRight, Search, Info, HelpCircle } from "lucide-react";

interface DashboardStatsProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onNavigate: (tab: string) => void;
}

export default function DashboardStats({ attendees, records, onNavigate }: DashboardStatsProps) {
  // State for search query in Bee-havior table
  const [beeSearchQuery, setBeeSearchQuery] = useState("");

  // 1. Core KPIs
  const totalAttendees = attendees.length;

  const multiActivityCount = useMemo(() => {
    const map: Record<string, string[]> = {};
    attendees.forEach(a => {
      map[a.id] = [];
    });
    records.forEach(r => {
      if (map[r.attendeeId] && !map[r.attendeeId].includes(r.activity)) {
        map[r.attendeeId].push(r.activity);
      }
    });
    return attendees.filter(att => (map[att.id] || []).length > 1).length;
  }, [attendees, records]);

  const multiActivityPercentage = totalAttendees
    ? Math.round((multiActivityCount / totalAttendees) * 100)
    : 0;

  const overallAttendanceRate = useMemo(() => {
    if (records.length === 0) return 0;
    const presents = records.filter(r => r.status === "present").length;
    return Math.round((presents / records.length) * 100);
  }, [records]);

  // 2. Monthly Trend Data (April, May, June 2026)
  const monthlyTrendData = useMemo(() => {
    const months = ["04", "05", "06"];
    const monthNames = { "04": "April", "05": "May", "06": "June" };

    return months.map(m => {
      const monthLogs = records.filter(r => r.date.split("-")[1] === m);
      const total = monthLogs.length;
      const presents = monthLogs.filter(r => r.status === "present").length;
      const rate = total ? Math.round((presents / total) * 100) : 0;

      return {
        month: monthNames[m as keyof typeof monthNames],
        "Attendance Rate (%)": rate,
        "Total Logs": total,
      };
    });
  }, [records]);

  // 3. Activity Comparison Data
  const activityData = useMemo(() => {
    return ACTIVITIES.map(act => {
      const activeAttendees = attendees.filter(att =>
        records.some(r => r.attendeeId === att.id && r.activity === act)
      ).length;

      const actLogs = records.filter(r => r.activity === act);
      const totalLogs = actLogs.length;
      const presents = actLogs.filter(r => r.status === "present").length;
      const attendanceRate = totalLogs ? Math.round((presents / totalLogs) * 100) : 0;

      return {
        name: act,
        shortName: act.replace("English ", ""),
        "Active Attendees": activeAttendees,
        "Attendance Rate (%)": attendanceRate,
      };
    });
  }, [attendees, records]);

  // Calculate detailed information for the new "Caserits Bee-havior" table
  const beehaviorData = useMemo(() => {
    const sorted = [...attendees].sort((a, b) => a.name.localeCompare(b.name));

    return sorted.map(att => {
      // Calculate attendance rates for each activity
      const activityStats = ACTIVITIES.map(act => {
        const logs = records.filter(r => r.attendeeId === att.id && r.activity === act);
        const total = logs.length;
        const presents = logs.filter(r => r.status === "present").length;
        const rate = total ? Math.round((presents / total) * 100) : null;
        return { activity: act, total, presents, rate };
      });

      // Overall attendance rate calculation
      const attLogs = records.filter(r => r.attendeeId === att.id);
      const overallTotal = attLogs.length;
      const overallPresents = attLogs.filter(r => r.status === "present").length;
      const overallRate = overallTotal ? Math.round((overallPresents / overallTotal) * 100) : 0;

      // Tier assignments based on specific rules
      let label = "Dormant";
      let color = "#2F4F4F"; // Charcoal
      let bgLight = "#E6ECEC"; // Light charcoal tint
      let textColor = "#2F4F4F";
      let icon = "💤";
      let meaning = "Hibernating. Rare sightings. Still getting to know the honeycomb.";

      if (overallRate >= 26 && overallRate <= 50) {
        label = "Hatcher";
        color = "#B89F30"; // Darker gold/amber to ensure contrast on off-white or yellow backgrounds
        bgLight = "#FEFBEA"; // Light Pale Amber tint
        textColor = "#6B5800";
        icon = "🥚";
        meaning = "Getting cozy. Halfway to becoming a regular flyer.";
      } else if (overallRate >= 51 && overallRate <= 75) {
        label = "Forager";
        color = "#E68A00"; // Rich Warm Orange for contrast
        bgLight = "#FFF7E6"; // Light warm orange tint
        textColor = "#804C00";
        icon = "🌸";
        meaning = "Honey maker. Solid presence, regularly contributing to the buzz.";
      } else if (overallRate >= 76) {
        label = "Busy Bee";
        color = "#D4AF37"; // Metallic/Golden Yellow for contrast
        bgLight = "#FFFDF0"; // Light Bright Golden Yellow tint
        textColor = "#7A5E00";
        icon = "🐝";
        meaning = "Queen's favorite. Elite attendance and top-tier dedication.";
      }

      // Check multi-activity participation
      const activeActivities = ACTIVITIES.filter(act =>
        records.some(r => r.attendeeId === att.id && r.activity === act)
      );
      const isMulti = activeActivities.length > 1;

      return {
        attendee: att,
        activityStats,
        overallRate,
        overallTotal,
        overallPresents,
        tier: { label, color, bgLight, textColor, icon, meaning },
        isMulti,
        participatedCount: activeActivities.length,
      };
    });
  }, [attendees, records]);

  // Filtered list of Bee-haviors based on search
  const filteredBeehaviorData = useMemo(() => {
    if (!beeSearchQuery.trim()) return beehaviorData;
    const query = beeSearchQuery.toLowerCase();
    return beehaviorData.filter(item =>
      item.attendee.name.toLowerCase().includes(query) ||
      (item.attendee.email && item.attendee.email.toLowerCase().includes(query))
    );
  }, [beehaviorData, beeSearchQuery]);

  // Accent colors for the 4 activities (Sage, Forest, Sand, Moss)
  const COLORS = ["#8A9A5B", "#2D3E35", "#D4A373", "#CCD5AE"];

  return (
    <div className="space-y-8 animate-fade-in" id="dashboard-tab">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Card 1: Total Attendees */}
        <div
          id="kpi-total-attendees"
          className="bg-white rounded-[32px] p-6 border border-[#E9E5D9] shadow-sm flex items-center space-x-5 hover:border-natural-sage transition duration-300"
        >
          <div className="p-4 bg-natural-cream text-natural-sage rounded-2xl border border-natural-border/30">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-sage font-bold mb-1">Total Unique Attendees</p>
            <h3 className="text-4xl font-serif font-bold text-[#1A1A1A] tracking-tight">{totalAttendees}</h3>
            <span className="text-xs text-natural-forest/60 font-medium flex items-center mt-1">
              Active across all clubs
            </span>
          </div>
        </div>

        {/* Card 2: Attendance Rate */}
        <div
          id="kpi-attendance-rate"
          className="bg-[#CCD5AE]/30 rounded-[32px] p-6 border border-[#CCD5AE]/50 shadow-sm flex items-center space-x-5 hover:bg-[#CCD5AE]/40 transition duration-300"
        >
          <div className="p-4 bg-white/60 text-natural-forest rounded-2xl border border-[#CCD5AE]/40">
            <CheckCircle2 className="h-6 w-6 text-natural-forest" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-forest font-bold mb-1">Avg. Attendance</p>
            <h3 className="text-4xl font-serif font-bold text-natural-forest tracking-tight">
              {overallAttendanceRate}%
            </h3>
            <span className="text-xs text-natural-forest/70 font-medium flex items-center mt-1">
              Based on {records.length} records
            </span>
          </div>
        </div>

        {/* Card 3: Multi-Enrollment */}
        <div
          id="kpi-multi-enrollment"
          className="bg-[#FAEDCD]/40 rounded-[32px] p-6 border border-[#D4A373]/30 shadow-sm flex items-center space-x-5 hover:bg-[#FAEDCD]/50 transition duration-300"
        >
          <div className="p-4 bg-white/60 text-natural-sand rounded-2xl border border-[#D4A373]/20">
            <Award className="h-6 w-6 text-natural-sand" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-sand font-bold mb-1">Inter-Activity Hub</p>
            <h3 className="text-4xl font-serif font-bold text-natural-forest tracking-tight">
              {multiActivityPercentage}%
            </h3>
            <span className="text-xs text-natural-sand font-semibold flex items-center mt-1">
              {multiActivityCount} colleagues active in 2+ activities
            </span>
          </div>
        </div>

        {/* Card 4: Quick Action */}
        <div
          id="kpi-quick-parse"
          className="bg-natural-forest text-natural-cream rounded-[32px] p-6 border border-natural-forest/25 shadow-lg flex flex-col justify-between hover:shadow-xl hover:bg-[#213028] transition-all duration-300 cursor-pointer"
          onClick={() => onNavigate("parser")}
        >
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-white/10 text-natural-wheat rounded-xl">
              <FileText className="h-5 w-5" />
            </div>
            <ArrowUpRight className="h-5 w-5 text-natural-sand" />
          </div>
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-[#CCD5AE] font-bold">Import Logs & Files</p>
            <h4 className="text-lg font-serif font-bold mt-1 text-white leading-tight">Smart Doc Parser</h4>
            <p className="text-xs text-natural-wheat/70 mt-1">Upload Excel, .docx, or .txt</p>
          </div>
        </div>
      </div>

      {/* NEW: Caserits Bee-havior Section */}
      <div id="caserits-bee-havior-section" className="bg-white rounded-[40px] border border-[#E9E5D9] p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif font-bold text-[#1A1A1A] flex items-center gap-2">
              <span className="text-2xl">🍯</span> Caserits Bee-havior Hub
            </h3>
            <p className="text-xs text-natural-sage font-medium mt-1">
              Overview of all active Caserits (participants), sorted alphabetically, mapping individual attendance rates across our four distinct activities and assigning custom engagement tiers.
            </p>
          </div>
          
          {/* Quick Search */}
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-natural-sage" />
            <input
              type="text"
              placeholder="Search Caserits by name..."
              value={beeSearchQuery}
              onChange={(e) => setBeeSearchQuery(e.target.value)}
              className="w-full bg-natural-cream/30 border border-natural-border rounded-2xl pl-10 pr-4 py-2 text-xs text-[#1A1A1A] placeholder-natural-sage/75 focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage font-medium"
            />
          </div>
        </div>

        {/* Engagement Tier Toggles / Interactive Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-natural-cream/20 rounded-3xl border border-natural-border/40">
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/60 border border-natural-border/30">
            <span className="text-2xl pt-1">💤</span>
            <div>
              <h5 className="text-xs font-bold text-[#2F4F4F]">Dormant (0% - 25%)</h5>
              <p className="text-[10px] text-natural-sage leading-normal font-medium">Hibernating. Rare sightings. Still getting to know the honeycomb.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FEFBEA]/60 border border-[#F0E68C]/40">
            <span className="text-2xl pt-1">🥚</span>
            <div>
              <h5 className="text-xs font-bold text-[#6B5800]">Hatcher (26% - 50%)</h5>
              <p className="text-[10px] text-natural-sage leading-normal font-medium">Getting cozy. Halfway to becoming a regular flyer.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FFF7E6]/60 border border-[#FFA500]/30">
            <span className="text-2xl pt-1">🌸</span>
            <div>
              <h5 className="text-xs font-bold text-[#804C00]">Forager (51% - 75%)</h5>
              <p className="text-[10px] text-natural-sage leading-normal font-medium">Honey maker. Solid presence, regularly contributing to the buzz.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FFFDF0]/60 border border-[#FFD700]/30">
            <span className="text-2xl pt-1">🐝</span>
            <div>
              <h5 className="text-xs font-bold text-[#7A5E00]">Busy Bee (76% - 100%)</h5>
              <p className="text-[10px] text-natural-sage leading-normal font-medium">Queen's favorite. Elite attendance and top-tier dedication.</p>
            </div>
          </div>
        </div>

        {/* The Comprehensive Bee-havior Table */}
        <div className="border border-natural-border rounded-3xl overflow-hidden shadow-inner max-h-[480px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-natural-cream/60 border-b border-natural-border text-natural-sage text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="p-4 pl-6">Caserits</th>
                {ACTIVITIES.map(act => (
                  <th key={act} className="p-4 text-center">{act}</th>
                ))}
                <th className="p-4 text-center">Overall</th>
                <th className="p-4 text-center">Hive Status</th>
                <th className="p-4 pr-6 text-center">Multi-Activity?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-natural-border/50 text-xs text-natural-forest font-medium">
              {filteredBeehaviorData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-natural-sage italic font-medium bg-natural-cream/15">
                    No Caserits found matching your search query.
                  </td>
                </tr>
              ) : (
                filteredBeehaviorData.map(({ attendee, activityStats, overallRate, overallTotal, overallPresents, tier, isMulti, participatedCount }) => {
                  return (
                    <tr key={attendee.id} className="hover:bg-natural-cream/15 transition duration-150">
                      {/* Name Card */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center space-x-3">
                          <div className="h-8.5 w-8.5 rounded-full bg-natural-wheat/40 text-natural-forest flex items-center justify-center font-serif font-bold text-xs border border-natural-border/50">
                            {attendee.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <h4 className="font-bold text-[#1A1A1A] text-xs leading-tight">{attendee.name}</h4>
                            {attendee.email && (
                              <p className="text-[10px] text-natural-sage font-mono mt-0.5">{attendee.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4 Activities column */}
                      {activityStats.map((stat, idx) => {
                        const actColor = COLORS[idx % COLORS.length];
                        return (
                          <td key={stat.activity} className="p-4 text-center font-mono">
                            {stat.total === 0 ? (
                              <span className="text-natural-sage/50 text-[11px]">—</span>
                            ) : (
                              <span
                                className="inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold"
                                style={{ backgroundColor: `${actColor}15`, color: actColor }}
                                title={`${stat.presents} present out of ${stat.total} logs`}
                              >
                                {stat.rate}%
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Overall Rate */}
                      <td className="p-4 text-center font-mono font-bold text-[#1A1A1A]">
                        {overallTotal === 0 ? (
                          <span className="text-natural-sage/50">—</span>
                        ) : (
                          <span title={`${overallPresents}/${overallTotal} total checks`}>
                            {overallRate}%
                          </span>
                        )}
                      </td>

                      {/* Hive Status (Tiers) */}
                      <td className="p-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold shadow-sm"
                             style={{ backgroundColor: tier.bgLight, color: tier.color, border: `1px solid ${tier.color}30` }}
                             title={tier.meaning}
                        >
                          <span>{tier.icon}</span>
                          <span>{tier.label}</span>
                        </div>
                      </td>

                      {/* Multi-Activity Column */}
                      <td className="p-4 pr-6 text-center">
                        {isMulti ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FAEDCD] text-[#855B32] border border-[#D4A373]/30 animate-pulse-subtle">
                            🍯 Yes ({participatedCount} Clubs)
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                            Single ({participatedCount})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Status Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-serif font-bold text-natural-forest">Activities Matrix Profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {activityData.map((act, index) => {
            const barColor = COLORS[index % COLORS.length];
            const isWeekly = act.name === "Speakeasy";
            return (
              <div
                key={act.name}
                className="bg-white rounded-[24px] p-5 border border-[#E9E5D9] shadow-sm hover:border-natural-sage hover:-translate-y-1 transition duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider text-white"
                      style={{ backgroundColor: barColor }}
                    >
                      Activity {index + 1}
                    </span>
                    <span className="text-xs text-natural-sage font-semibold">Voluntary participation</span>
                  </div>
                  <h4 className="font-serif font-bold text-[#1A1A1A] text-base mt-3 leading-snug line-clamp-1">{act.name}</h4>
                  <p className="text-xs text-[#8A9A5B] mt-1">{isWeekly ? "Weekly sessions" : "Biweekly sessions"}</p>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-natural-forest/70">Attendance rate:</span>
                    <span style={{ color: barColor }} className="font-bold">{act["Attendance Rate (%)"]}%</span>
                  </div>
                  {/* Visual Progress bar */}
                  <div className="h-2 bg-natural-cream rounded-full border border-natural-border/30 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${act["Attendance Rate (%)"]}%`, backgroundColor: barColor }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts Grid - Moved to the bottom of the dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Trend Area Chart */}
        <div className="bg-white rounded-[40px] border border-[#E9E5D9] p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-serif font-bold text-[#1A1A1A]">Attendance Trends</h3>
              <p className="text-xs text-natural-sage font-medium">Percentage of presence logged each month</p>
            </div>
            <span className="text-xs font-semibold bg-natural-wheat/50 text-natural-forest border border-natural-border/40 px-3 py-1.5 rounded-full">
              Q2 Year 2026
            </span>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8A9A5B" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8A9A5B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E5D9" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#8A9A5B", fontSize: 12, fontWeight: "bold" }} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#8A9A5B", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#2D3E35",
                    borderRadius: "16px",
                    border: "1px solid #E9E5D9",
                    color: "#FDFBF7",
                  }}
                  itemStyle={{ color: "#FAEDCD" }}
                  labelStyle={{ fontWeight: "bold", fontFamily: "Playfair Display" }}
                />
                <Area
                  type="monotone"
                  dataKey="Attendance Rate (%)"
                  stroke="#2D3E35"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRate)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Bar Chart */}
        <div className="bg-white rounded-[40px] border border-[#E9E5D9] p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-serif font-bold text-[#1A1A1A]">Cross-Activity Comparisons</h3>
              <p className="text-xs text-natural-sage font-medium">Average Attendance rates per Activity</p>
            </div>
            <span className="text-xs font-semibold bg-[#CCD5AE]/30 text-natural-forest border border-[#CCD5AE]/40 px-3 py-1.5 rounded-full">
              4 Core Activities
            </span>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E5D9" />
                <XAxis dataKey="shortName" tickLine={false} axisLine={false} tick={{ fill: "#8A9A5B", fontSize: 11, fontWeight: "bold" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8A9A5B", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#2D3E35",
                    borderRadius: "16px",
                    border: "1px solid #E9E5D9",
                    color: "#FDFBF7",
                  }}
                  itemStyle={{ color: "#FAEDCD" }}
                  labelStyle={{ fontWeight: "bold", fontFamily: "Playfair Display" }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="Attendance Rate (%)" fill="#2D3E35" radius={[6, 6, 0, 0]}>
                  {activityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
