import { useState, type ReactNode } from "react";
import { CalendarDays, Download, Inbox, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { ACTIVITIES } from "../../../types";
import {
  ActivityBadge,
  Alert,
  Badge,
  Button,
  Card,
  ChartFrame,
  ConfirmDialog,
  DataTable,
  DateInput,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Panel,
  SegmentedControl,
  Select,
  Stat,
  StatusBadge,
  Tabs,
  Textarea,
  ToastProvider,
  useToast,
  type ButtonSize,
  type ButtonVariant,
  type ChartDatum,
  type DataTableColumn,
  type StatusTone,
} from "..";

// US-56: dev-only examples page (examples.html → main.tsx). Never part of the production build:
// vite.config.ts builds index.html only (pinned by examples.test.ts). To add a component (e.g. US-57
// dialogs, toasts, tabs, tables), write a section component and append it to EXAMPLE_SECTIONS.

export interface ExampleSection {
  id: string;
  title: string;
  render: () => ReactNode;
}

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "danger", "link"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];
const STATUS_TONES: StatusTone[] = ["danger", "warning", "success", "info"];

function Row({ label, children }: { label: string; children: ReactNode; key?: string }) {
  return (
    <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
      <span className="w-32 shrink-0 text-micro font-semibold tracking-wider text-sage-text uppercase">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ButtonsExample() {
  const [loading, setLoading] = useState(false);
  return (
    <>
      {VARIANTS.map(variant => (
        <Row key={variant} label={variant}>
          {SIZES.map(size => (
            <Button key={size} variant={variant} size={size}>
              {`${variant} ${size}`}
            </Button>
          ))}
          <Button variant={variant} disabled>
            Disabled
          </Button>
        </Row>
      ))}
      <Row label="icon + loading">
        <Button icon={<Plus className="size-4" />}>Add Caserit</Button>
        <Button variant="secondary" icon={<Download className="size-4" />}>
          Export
        </Button>
        <Button loading>Saving</Button>
        <Button
          variant="secondary"
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1500);
          }}
        >
          Click to load
        </Button>
      </Row>
    </>
  );
}

function IconButtonsExample() {
  return (
    <Row label="variants">
      <IconButton aria-label="Edit" icon={<Pencil className="size-4" />} />
      <IconButton aria-label="Close" variant="secondary" icon={<X className="size-4" />} />
      <IconButton aria-label="Add" variant="primary" icon={<Plus className="size-4" />} />
      <IconButton aria-label="Delete" variant="danger" icon={<Trash2 className="size-4" />} />
      <IconButton aria-label="Delete (disabled)" variant="danger" disabled icon={<Trash2 className="size-4" />} />
      <IconButton aria-label="Saving" loading icon={<Pencil className="size-4" />} />
    </Row>
  );
}

function FieldsExample() {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Field label="Colleague name" help="As it appears in Teams." required error={name.trim() ? undefined : "Enter a name."}>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ana Pérez" />
      </Field>
      <Field label="Activity">
        <Select defaultValue="">
          <option value="" disabled>
            Select an activity
          </option>
          {ACTIVITIES.map(a => (
            <option key={a}>{a}</option>
          ))}
        </Select>
      </Field>
      <Field label="Session date" help="Defaults to the reference date.">
        <DateInput defaultValue="2026-06-24" />
      </Field>
      <Field label="Disabled field">
        <Input disabled defaultValue="Read-only mode" />
      </Field>
      <Field label="Coaching note" help="Visible to admins only." className="md:col-span-2">
        <Textarea placeholder="Strengths, goals…" />
      </Field>
    </div>
  );
}

function ContainersExample() {
  return (
    <Panel title="Panel (tab container)" actions={<Button size="sm" variant="secondary">Action</Button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Card with a title">Cards sit inside a Panel: one nesting level, never a Card in a Card.</Card>
        <Card>Card without a title (a plain div).</Card>
      </div>
    </Panel>
  );
}

function BadgesExample() {
  return (
    <>
      <Row label="badge">
        <Badge>Neutral sm</Badge>
        <Badge size="md">Neutral md</Badge>
      </Row>
      <Row label="status sm">
        {STATUS_TONES.map(tone => (
          <StatusBadge key={tone} tone={tone}>
            {tone}
          </StatusBadge>
        ))}
      </Row>
      <Row label="status md">
        {STATUS_TONES.map(tone => (
          <StatusBadge key={tone} tone={tone} size="md">
            {tone}
          </StatusBadge>
        ))}
      </Row>
      <Row label="activity">
        {ACTIVITIES.map(a => (
          <ActivityBadge key={a} activity={a} />
        ))}
      </Row>
      <Row label="activity md">
        {ACTIVITIES.map(a => (
          <ActivityBadge key={a} activity={a} size="md" />
        ))}
      </Row>
    </>
  );
}

// US-57 sections ---------------------------------------------------------------------------------

function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="mb-3 text-body text-text-muted">
        Open it, then try Tab / Shift+Tab (focus stays inside), Escape, a click on the overlay, and scrolling the page behind
        (locked). Focus returns to the button on close.
      </p>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit colleague"
        description="Changes apply to every tab."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Save changes</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Colleague name">
            <Input defaultValue="Ana Pérez" />
          </Field>
          <Field label="Coaching note">
            <Textarea defaultValue="Strong speaker, wants more reading practice." />
          </Field>
          <a href="#dialog" className="text-body text-forest underline underline-offset-4">
            A link inside the dialog
          </a>
          {Array.from({ length: 12 }, (_, i) => (
            <p key={i} className="text-body text-text-muted">
              Long dialog content line {i + 1}: the body scrolls inside the 90dvh panel.
            </p>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function ConfirmDialogExample() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
        Remove Ana Pérez
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          toast.success("Ana Pérez was removed (example: nothing was deleted).");
        }}
        title="Remove colleague?"
        objectName="Ana Pérez"
        consequences="Her 12 attendance records and 3 coaching notes are deleted too. This can't be undone."
        confirmLabel="Remove colleague"
      />
    </>
  );
}

function ToastAlertExample() {
  const toast = useToast();
  return (
    <>
      <Row label="toast">
        <Button variant="secondary" onClick={() => toast.success("Attendance saved for 14 colleagues.")}>
          Show success toast
        </Button>
        <Button variant="secondary" onClick={() => toast.error("Could not save: the server didn't answer.")}>
          Show error toast
        </Button>
      </Row>
      <div className="flex flex-col gap-3 pt-3">
        {STATUS_TONES.map(tone => (
          <Alert key={tone} tone={tone} title={`Alert ${tone}`}>
            {tone === "danger" ? "Announced at once (role=alert)." : "Announced politely (role=status)."}
          </Alert>
        ))}
      </div>
    </>
  );
}

function TabsExample() {
  return (
    <Tabs
      label="Example sections"
      tabs={[
        { id: "dashboard", label: "Dashboard", content: <p className="text-body">Arrow keys move between tabs; Home / End jump.</p> },
        { id: "checkin", label: "Manual Check-In", content: <p className="text-body">Selection follows focus.</p> },
        { id: "caserits", label: "Caserits & Progress", content: <p className="text-body">Only the selected tab is in the Tab order.</p> },
        { id: "import", label: "Import Forage Logs", content: <p className="text-body">The tab list scrolls on its own at 375 px.</p> },
      ]}
    />
  );
}

function SegmentedControlExample() {
  const [grouping, setGrouping] = useState("month");
  return (
    <Row label="group by">
      <SegmentedControl
        label="Group trends by"
        options={[
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
          { value: "quarter", label: "Quarter" },
        ]}
        value={grouping}
        onValueChange={setGrouping}
      />
      <span className="text-body text-text-muted">Selected: {grouping}</span>
    </Row>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NAMES = ["Ana Pérez", "Bea Ruiz", "Carlos Gómez", "Diana Flores", "Eduardo Vargas", "Fernanda Rojas", "Gabriel Torres", "Helena Castro"];

interface WideRow {
  name: string;
  rates: (number | null)[];
}

const WIDE_ROWS: WideRow[] = Array.from({ length: 16 }, (_, r) => ({
  name: `${NAMES[r % NAMES.length]}${r >= NAMES.length ? " II" : ""}`,
  rates: MONTHS.map((_, m) => ((r + m) % 5 === 0 ? null : ((r * 7 + m * 13) % 101))),
}));

const WIDE_COLUMNS: DataTableColumn<WideRow>[] = [
  { key: "name", header: "Colleague" },
  ...MONTHS.map((month, m) => ({
    key: month,
    header: month,
    align: "right" as const,
    cell: (row: WideRow) => (row.rates[m] === null ? "No data" : `${row.rates[m]}%`),
  })),
];

function DataTableExample() {
  return (
    <DataTable
      caption="Monthly attendance rate by colleague"
      columns={WIDE_COLUMNS}
      rows={WIDE_ROWS}
      getRowKey={row => row.name}
      stickyFirstColumn
      className="max-h-80"
    />
  );
}

function PagePiecesExample() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard (PageHeader example)"
        description="Reference date: June 24, 2026."
        actions={<Button icon={<Download className="size-4" />}>Generate Outcome Report</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total Caserits" value="42" hint="+3 since May" icon={<Users className="size-5" />} />
        <Stat label="Sessions this month" value="9" icon={<CalendarDays className="size-5" />} />
        <Stat label="Attendance rate" value="No data" hint="No events in this period" />
      </div>
      <EmptyState
        icon={<Inbox className="size-6" />}
        title="No attendance logs yet"
        description="Import a Teams attendance file to see who joined each session."
        action={<Button variant="secondary">Go to Import Forage Logs</Button>}
      />
    </div>
  );
}

const CHART_DATA: ChartDatum[] = [
  { label: "Jan", rate: 72, goal: 75 },
  { label: "Feb", rate: 64, goal: 75 },
  { label: "Mar", rate: null, goal: 75 },
  { label: "Apr", rate: 81, goal: 75 },
  { label: "May", rate: 77, goal: 80 },
  { label: "Jun", rate: 88, goal: 80 },
];

function ChartFrameExample() {
  const [kind, setKind] = useState<"line" | "bar">("line");
  return (
    <ChartFrame
      title="Attendance rate by month (March has no events)"
      labelHeader="Month"
      kind={kind}
      data={CHART_DATA}
      series={[
        { key: "rate", name: "Attendance rate" },
        { key: "goal", name: "Goal" },
      ]}
      controls={
        <SegmentedControl
          label="Chart type"
          options={[
            { value: "line", label: "Line" },
            { value: "bar", label: "Bar" },
          ]}
          value={kind}
          onValueChange={v => setKind(v as "line" | "bar")}
        />
      }
    />
  );
}

function LongContentExample() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 30 }, (_, i) => (
        <p key={i} className="text-body text-text-muted">
          Filler line {i + 1}: long content so the page scrolls and the dialog's scroll lock can be checked.
        </p>
      ))}
    </div>
  );
}

export const EXAMPLE_SECTIONS: ExampleSection[] = [
  { id: "button", title: "Button", render: () => <ButtonsExample /> },
  { id: "icon-button", title: "IconButton", render: () => <IconButtonsExample /> },
  { id: "field", title: "Field · Input · Select · Textarea · DateInput", render: () => <FieldsExample /> },
  { id: "containers", title: "Card · Panel", render: () => <ContainersExample /> },
  { id: "badge", title: "Badge · StatusBadge · ActivityBadge", render: () => <BadgesExample /> },
  { id: "dialog", title: "Dialog", render: () => <DialogExample /> },
  { id: "confirm-dialog", title: "ConfirmDialog", render: () => <ConfirmDialogExample /> },
  { id: "toast-alert", title: "Toast · Alert", render: () => <ToastAlertExample /> },
  { id: "tabs", title: "Tabs", render: () => <TabsExample /> },
  { id: "segmented-control", title: "SegmentedControl", render: () => <SegmentedControlExample /> },
  { id: "data-table", title: "DataTable", render: () => <DataTableExample /> },
  { id: "page-pieces", title: "PageHeader · Stat · EmptyState", render: () => <PagePiecesExample /> },
  { id: "chart-frame", title: "ChartFrame", render: () => <ChartFrameExample /> },
  { id: "long-content", title: "Long content (scroll lock check)", render: () => <LongContentExample /> },
];

export default function ExamplesPage({ sections = EXAMPLE_SECTIONS }: { sections?: ExampleSection[] }) {
  // US-57: the toast examples need the app-wide region
  return (
    <ToastProvider>
      <ExamplesContent sections={sections} />
    </ToastProvider>
  );
}

function ExamplesContent({ sections }: { sections: ExampleSection[] }) {
  return (
    <div className="min-h-screen bg-cream font-sans text-forest">
      <header className="border-b border-border bg-surface px-6 py-4">
        <h1 className="font-serif text-h1 font-semibold">UI components</h1>
        <p className="text-body text-text-muted">Development-only examples page (US-56). Not part of the production build.</p>
        <nav aria-label="Components" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} className="text-body text-forest underline underline-offset-4">
              {s.title}
            </a>
          ))}
        </nav>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-8">
        {sections.map(s => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="flex flex-col gap-4">
            <h2 id={`${s.id}-title`} className="text-h2 font-semibold">
              {s.title}
            </h2>
            <div className="rounded-card border border-border bg-surface p-6">{s.render()}</div>
          </section>
        ))}
      </main>
    </div>
  );
}
