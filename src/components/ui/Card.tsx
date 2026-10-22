import { useId, type ReactNode } from "react";
import { cx, type NativeAttributes } from "./styles";

// US-56: the two containers, one nesting level only: a Panel (the tab container, rounded-panel)
// holds Cards (rounded-card); a Card never holds another Card or a Panel. With a `title` each one
// renders a <section> named by its heading (h2 for Panel, h3 for Card); without it, a plain <div>.

interface ContainerProps extends NativeAttributes {
  title?: ReactNode;
  /** Optional content on the right of the title row (e.g. a Button). */
  actions?: ReactNode;
}

function Container({
  title,
  actions,
  className,
  children,
  heading: Heading,
  headingClass,
  ...rest
}: ContainerProps & { heading: "h2" | "h3"; headingClass: string }) {
  const headingId = useId();
  if (title === undefined) {
    return (
      <div {...rest} className={className}>
        {children}
      </div>
    );
  }
  return (
    <section {...rest} aria-labelledby={rest["aria-labelledby"] ?? headingId} className={className}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Heading id={headingId} className={headingClass}>
          {title}
        </Heading>
        {actions}
      </div>
      {children}
    </section>
  );
}

export type CardProps = ContainerProps;

export default function Card({ className, ...rest }: CardProps) {
  return (
    <Container
      {...rest}
      heading="h3"
      headingClass="text-h3 font-semibold text-forest"
      className={cx("rounded-card border border-border bg-surface p-6 text-forest shadow-sm", className)}
    />
  );
}

export type PanelProps = ContainerProps;

export function Panel({ className, ...rest }: PanelProps) {
  return (
    <Container
      {...rest}
      heading="h2"
      headingClass="font-serif text-h2 font-semibold text-forest"
      className={cx("rounded-panel border border-border bg-cream p-6 text-forest md:p-8", className)}
    />
  );
}
