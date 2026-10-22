import { createContext, useContext, useId, type ReactNode } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { CONTROL, DISABLED, cx, type NativeAttributes } from "./styles";

// US-56: a labelled form field. <Field> renders the label, the help text and the error, and hands
// its ids to the control inside (Input / Select / Textarea / DateInput) through context:
//   label[for] → control id · control[aria-describedby] → help id + error id
//   aria-invalid="true" when there is an error · aria-required="true" when required.
// The controls also work on their own (pass id / invalid / aria-* yourself).

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Help text under the control. */
  help?: ReactNode;
  /** Error message; marks the control aria-invalid and joins its description. */
  error?: ReactNode;
  required?: boolean;
  /** Control id (generated with useId when omitted). Set it here, not on the control. */
  id?: string;
  className?: string;
}

export default function Field({ label, children, help, error, required = false, id, className }: FieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className="text-body font-medium text-forest">
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      <FieldContext.Provider value={{ id: controlId, describedBy, invalid: !!error, required }}>{children}</FieldContext.Provider>
      {help && (
        <p id={helpId} className="text-body text-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-body font-medium text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

interface ControlOwnProps {
  /** Standalone use (outside <Field>): marks the control aria-invalid. */
  invalid?: boolean;
}

/** Merges the Field's wiring with the control's own props (the control's own aria-* win). */
function useFieldProps(props: NativeAttributes & ControlOwnProps) {
  const field = useContext(FieldContext);
  const describedBy = [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  const invalid = props.invalid || field?.invalid;
  return {
    id: field?.id ?? props.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (invalid ? true : undefined),
    "aria-required": props["aria-required"] ?? (field?.required ? true : undefined),
  };
}

export type InputProps = NativeAttributes & ControlOwnProps;

export function Input({ invalid, className, ...rest }: InputProps) {
  const wiring = useFieldProps({ ...rest, invalid });
  return <input {...rest} {...wiring} className={cx(CONTROL, "h-11", DISABLED, className)} />;
}

/** Native date picker (yyyy-mm-dd value), same look as Input. */
export function DateInput(props: Omit<InputProps, "type">) {
  return <Input {...props} type="date" />;
}

export type TextareaProps = NativeAttributes & ControlOwnProps;

/** Multiline: starts at h-11's padding but grows (min-h-24), so it doesn't take the fixed h-11. */
export function Textarea({ invalid, className, rows = 3, ...rest }: TextareaProps) {
  const wiring = useFieldProps({ ...rest, invalid });
  return <textarea {...rest} {...wiring} rows={rows} className={cx(CONTROL, "min-h-24 py-2.5", DISABLED, className)} />;
}

export type SelectProps = NativeAttributes & ControlOwnProps;

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  const wiring = useFieldProps({ ...rest, invalid });
  return (
    <div className="relative">
      <select {...rest} {...wiring} className={cx(CONTROL, "h-11 appearance-none pr-10", DISABLED, className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-forest" aria-hidden="true" />
    </div>
  );
}
