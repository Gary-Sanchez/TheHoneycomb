import { useState, type ReactNode } from "react";
import { Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { ACTIVITIES } from "../../../types";
import {
  ActivityBadge,
  Badge,
  Button,
  Card,
  DateInput,
  Field,
  IconButton,
  Input,
  Panel,
  Select,
  StatusBadge,
  Textarea,
  type ButtonSize,
  type ButtonVariant,
  type StatusTone,
} from "..";

// US-56: dev-only examples page (examples.html → main.tsx). Never part of the production build:
// vite.config.ts builds index.html only (pinned by examples.test.ts). To add a component (US-57:
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

export const EXAMPLE_SECTIONS: ExampleSection[] = [
  { id: "button", title: "Button", render: () => <ButtonsExample /> },
  { id: "icon-button", title: "IconButton", render: () => <IconButtonsExample /> },
  { id: "field", title: "Field · Input · Select · Textarea · DateInput", render: () => <FieldsExample /> },
  { id: "containers", title: "Card · Panel", render: () => <ContainersExample /> },
  { id: "badge", title: "Badge · StatusBadge · ActivityBadge", render: () => <BadgesExample /> },
];

export default function ExamplesPage({ sections = EXAMPLE_SECTIONS }: { sections?: ExampleSection[] }) {
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
