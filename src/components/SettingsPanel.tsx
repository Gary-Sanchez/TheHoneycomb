import { useState, FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck, Lock, LogOut } from "lucide-react";
import { AuthStatus } from "../types";
import { Alert, Button, Field, IconButton, Input, PageHeader } from "./ui";

interface SettingsPanelProps {
  className?: string;
  auth: AuthStatus;
  onAuthChange: () => Promise<void> | void;
}

// Admin login / first-run password setup / sign out (US-11)
function AdminAccessSection({ auth, onAuthChange }: { auth: AuthStatus; onAuthChange: () => Promise<void> | void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isSetup = !auth.adminConfigured;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    if (isSetup && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(isSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) || "Sign in failed. Please try again.");
      }
      setPassword("");
      setConfirmPassword("");
      await onAuthChange();
    } catch (err: any) {
      setError(err?.message || "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    await onAuthChange();
  };

  const errorId = "admin-access-error";
  const fieldError = error ? { invalid: true, "aria-describedby": errorId } : {};

  return (
    <div className="space-y-4" id="admin-access">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Lock className="size-6 text-sage-text" aria-hidden="true" />
            Admin Access
          </span>
        }
        description="Anyone can view attendance data. Adding, editing, importing, or deleting data requires an admin session."
      />

      {auth.authenticated ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-moss/60 bg-moss/20 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 shrink-0 text-sage-text" aria-hidden="true" />
            <p className="text-body font-bold text-forest">Signed in as admin. Editing is enabled.</p>
          </div>
          <Button variant="secondary" size="sm" icon={<LogOut className="size-3.5" />} onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      ) : isSetup && !auth.setupAllowed ? (
        <Alert tone="warning">
          No admin password is configured yet. It can only be created from the machine running the server (localhost).
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-border bg-cream/20 p-6">
          {isSetup && (
            <p className="text-body font-bold text-forest">
              No admin password is set yet. Create one to enable editing (minimum 8 characters).
            </p>
          )}
          <Field label={isSetup ? "New Admin Password" : "Admin Password"} id="admin-password">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                className="pr-12"
                {...fieldError}
              />
              <IconButton
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0.5 top-1/2 -translate-y-1/2"
                aria-label={showPassword ? "Hide password" : "Show password"}
                icon={showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              />
            </div>
          </Field>
          {isSetup && (
            <Field label="Confirm Password" id="admin-password-confirm">
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e: { target: { value: string } }) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                {...fieldError}
              />
            </Field>
          )}

          {error && (
            <Alert tone="danger" id={errorId}>
              {error}
            </Alert>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={submitting} disabled={!password}>
              {isSetup ? "Create Admin Password" : "Sign In"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SettingsPanel({ className, auth, onAuthChange }: SettingsPanelProps) {
  return (
    <div
      className={`bg-surface rounded-panel border border-border p-6 md:p-8 shadow-sm space-y-8 animate-fade-in ${className ?? ""}`}
      id="settings-panel"
    >
      <AdminAccessSection auth={auth} onAuthChange={onAuthChange} />
      {/* US-49: app version (package.json, inlined at build time). Kept apart from AdminAccessSection. */}
      <p id="app-version" className="text-xs font-medium text-sage-text border-t border-border pt-4">
        The Honeycomb v{__APP_VERSION__}
      </p>
    </div>
  );
}
