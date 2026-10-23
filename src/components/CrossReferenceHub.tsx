import { useState, useMemo } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import { pluralize } from "../utils";
import { getAttendedActivities } from "../beehavior";
import { getActivityTheme } from "../activityTheme";
import { DataTable, Field, PageHeader, SegmentedControl, Select, type DataTableColumn } from "./ui";
import { Check, Users, Award, ArrowRightLeft, Sparkles } from "lucide-react";

interface CrossReferenceHubProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  onNavigateToAttendee: (attendee: Attendee) => void;
}

type OverlapFilter = "all" | "single" | "multi" | "super";

/** Native select of the activities (minus `exclude`), with the selected activity's icon and color. */
function ActivitySelect({ value, onChange, exclude }: { value: string; onChange: (activity: string) => void; exclude: string }) {
  const theme = getActivityTheme(value);
  const Icon = theme?.icon;
  return (
    <div className="relative">
      {Icon && <Icon className={`pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 ${theme.textClass}`} aria-hidden="true" />}
      <Select value={value} onChange={e => onChange(e.target.value)} className="pl-9">
        {ACTIVITIES.filter(act => act !== exclude).map(act => (
          <option key={act} value={act}>
            {act}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default function CrossReferenceHub({ attendees, records, onNavigateToAttendee }: CrossReferenceHubProps) {
  const [overlapFilter, setOverlapFilter] = useState<OverlapFilter>("all");
  
  // Custom Cross-Referencing Overlap Analyzer States
  const [compareAct1, setCompareAct1] = useState<string>(ACTIVITIES[0]);
  const [compareAct2, setCompareAct2] = useState<string>(ACTIVITIES[1]);

  // US-43: attendee ID → activities they participate in, i.e. with at least one `present` (an
  // `absent`-only activity doesn't count). Same definition as the Dashboard and the Bee-havior Hub;
  // it feeds the filter, the counters, the matrix and the two-activity comparison.
  const attendeeActivitiesMap = useMemo(() => getAttendedActivities(attendees, records), [attendees, records]);

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
    // US-47: the emoji is kept apart from the text so it can be hidden from screen readers
    const insights: { icon: string; text: string }[] = [];

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
          insights.push({
            icon: "💡",
            text: `High overlap: ${rate}% of colleagues in ${act1} also attend ${act2} (${pluralize(shared, "shared colleague")}).`,
          });
        }
      });
    });

    if (stats.super > 0) {
      insights.push({
        icon: "🏆",
        text: `Super Active: ${pluralize(stats.super, "colleague")} attended 3 or more activities.`,
      });
    }

    if (insights.length === 0) {
      insights.push({
        icon: "✏️",
        text: "No strong overlap between activities yet. It will show up as more attendance records are added.",
      });
    }

    return insights;
  }, [attendees, stats, attendeeActivitiesMap]);

  // US-63: the matrix as a DataTable. Each activity column shows its icon and color next to the name;
  // attendance reads "Attended" / "Not attended" to assistive tech and never depends on color alone.
  const columns: DataTableColumn<Attendee>[] = [
    {
      key: "name",
      header: "Colleague Name",
      cell: att => {
        const numActivities = (attendeeActivitiesMap[att.id] || []).length;
        return (
          <div className="flex items-center space-x-2">
            <span>{att.name}</span>
            {numActivities >= 3 ? (
              <span className="text-micro uppercase font-bold tracking-widest bg-natural-forest text-natural-cream border border-natural-forest/30 px-1.5 py-0.5 rounded">
                Super Active
              </span>
            ) : numActivities >= 2 ? (
              <span className="text-micro uppercase font-bold tracking-widest bg-natural-wheat text-sand-text border border-natural-border/60 px-1.5 py-0.5 rounded">
                Multi-Activity
              </span>
            ) : null}
          </div>
        );
      },
    },
    ...ACTIVITIES.map((act): DataTableColumn<Attendee> => {
      const theme = getActivityTheme(act);
      const Icon = theme?.icon;
      return {
        key: act,
        header: (
          <span className={`inline-flex items-center gap-1.5 ${theme?.textClass ?? ""}`}>
            {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
            <span>{act}</span>
          </span>
        ),
        cell: att =>
          (attendeeActivitiesMap[att.id] || []).includes(act) ? (
            <div className="flex justify-center">
              <div className={`h-6 w-6 rounded-full bg-natural-cream border border-natural-border flex items-center justify-center font-bold ${theme?.textClass ?? "text-sage-text"}`}>
                <Check className="h-4 w-4 stroke-[3.5]" aria-hidden="true" />
                <span className="sr-only">Attended</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="text-text-muted font-bold" aria-hidden="true">—</span>
              <span className="sr-only">Not attended</span>
            </div>
          ),
      };
    }),
    {
      key: "total",
      header: "Total Activities",
      cell: att => {
        const numActivities = (attendeeActivitiesMap[att.id] || []).length;
        return (
          <div className="flex justify-center">
            <span className={`inline-block h-7 w-7 rounded-full leading-7 text-center text-xs font-bold ${
              numActivities >= 3 ? "bg-natural-forest text-white" :
              numActivities >= 2 ? "bg-sand-text text-white" : "bg-natural-cream text-sage-text border border-natural-border/40"
            }`}>
              {numActivities}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in" id="cross-ref-tab">
      <PageHeader title="Overlap Cross-Referencer" />

      {/* Top row: Multi-activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Single Activity */}
        <div className="bg-white rounded-panel p-6 border border-natural-border shadow-sm flex items-center space-x-5 hover:border-natural-sage transition duration-300">
          <div className="p-4 bg-natural-cream text-natural-sage rounded-2xl border border-natural-border/40">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-sage font-bold mb-1">Single Activity Only</p>
            <h3 className="text-4xl font-serif font-bold text-natural-forest tracking-tight">{stats.single}</h3>
            <span className="text-xs text-natural-sage font-semibold">Attended one activity</span>
          </div>
        </div>

        {/* Multi Activity (2+) */}
        <div className="bg-white rounded-panel p-6 border border-natural-border shadow-sm flex items-center space-x-5 hover:border-natural-sand transition duration-300">
          <div className="p-4 bg-natural-wheat text-natural-sand rounded-2xl border border-natural-border/30">
            <ArrowRightLeft className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-natural-sand font-bold mb-1">Multi-Activity</p>
            <h3 className="text-4xl font-serif font-bold text-natural-forest tracking-tight">{stats.multi}</h3>
            <span className="text-xs text-natural-sand font-semibold">Active in 2+ activities</span>
          </div>
        </div>

        {/* Super Active (3+) */}
        <div className="bg-white rounded-panel p-6 border border-natural-border shadow-sm flex items-center space-x-5 hover:border-natural-forest transition duration-300">
          <div className="p-4 bg-moss/40 text-natural-forest rounded-2xl border border-moss/60">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-sage-text font-bold mb-1">Super Active</p>
            <h3 className="text-4xl font-serif font-bold text-natural-forest tracking-tight">{stats.super}</h3>
            <span className="text-xs text-sage-text font-semibold">Active in 3+ activities</span>
          </div>
        </div>

      </div>

      {/* Main Interactive Analyzer & Semantic Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Interactive Compare Tool Card */}
        <div className="lg:col-span-2 bg-surface text-natural-forest rounded-panel p-6 shadow-md border border-natural-border flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-sage-text" aria-hidden="true" />
              <h3 className="text-lg font-serif font-bold text-natural-forest">Compare Two Activities</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Select two activities to see the colleagues who attended both. Useful for spotting overlaps when planning the activity calendar.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* An activity picked in one selector is not offered in the other */}
              <Field label="First Activity" id="compare-activity-1">
                <ActivitySelect value={compareAct1} onChange={setCompareAct1} exclude={compareAct2} />
              </Field>
              <Field label="Second Activity" id="compare-activity-2">
                <ActivitySelect value={compareAct2} onChange={setCompareAct2} exclude={compareAct1} />
              </Field>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-natural-border space-y-4">
            <h4 className="text-xs font-bold text-sage-text uppercase tracking-widest">
              Shared Colleague Cohort ({intersectingAttendees.length})
            </h4>

            {intersectingAttendees.length === 0 ? (
              <p className="text-xs text-text-muted italic">No colleagues attended both activities yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-[128px] overflow-y-auto p-1 -m-1">
                {intersectingAttendees.map(att => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => onNavigateToAttendee(att)}
                    className="bg-cream hover:bg-wheat border border-natural-border text-natural-forest rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Check className="h-3.5 w-3.5 text-sage-text stroke-[3]" aria-hidden="true" />
                    <span>{att.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Automatic Overlap Insights Sidebar */}
        <div className="bg-natural-cream/30 border border-natural-border rounded-panel p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-natural-sage uppercase tracking-widest">
              Automated Activity Insights
            </h4>
            
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {semanticInsights.map((insight, idx) => (
                <div key={idx} className="bg-white border border-natural-border/60 p-4 rounded-xl text-xs text-natural-forest leading-relaxed shadow-sm">
                  <span aria-hidden="true">{insight.icon}</span> {insight.text}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Roster Grid / Overlap Matrix */}
      <div className="space-y-4">
        
        {/* Title and Filter Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-serif font-bold text-natural-forest">Participation Matrix Directory</h3>
            <p className="text-xs text-sage-text font-medium">Total cross-referenced colleague participation breakdown</p>
          </div>

          <SegmentedControl
            label="Filter by number of activities"
            className="flex-wrap"
            value={overlapFilter}
            onValueChange={value => setOverlapFilter(value as OverlapFilter)}
            options={[
              { value: "all", label: `All (${attendees.length})` },
              { value: "single", label: `Single (${stats.single})` },
              { value: "multi", label: `Multi-Activity (2+) (${stats.multi})` },
              { value: "super", label: `Super Active (${stats.super})` },
            ]}
          />
        </div>

        {/* Matrix Table */}
        <DataTable
          caption="Participation Matrix Directory"
          hideCaption
          columns={columns}
          rows={filteredAttendees}
          getRowKey={att => att.id}
          stickyFirstColumn
          emptyMessage="No colleagues to show"
        />

      </div>

    </div>
  );
}
