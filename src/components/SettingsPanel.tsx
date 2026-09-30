import { useState, FormEvent } from "react";
import { Eye, EyeOff, AlertTriangle, Loader2, ShieldCheck, Lock, LogOut } from "lucide-react";
import { AuthStatus } from "../types";

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

  return (
    <div className="space-y-4" id="admin-access">
      <div>
        <h2 className="text-2xl font-serif font-bold text-[#1A1A1A] flex items-center gap-2">
          <Lock className="h-6 w-6 text-natural-sage" />
          Admin Access
        </h2>
        <p className="text-sm text-natural-sage mt-1 font-medium">
          Anyone can view attendance data. Adding, editing, importing, or deleting data requires an admin session.
        </p>
      </div>

      {auth.authenticated ? (
        <div className="bg-[#CCD5AE]/20 border border-[#CCD5AE]/60 rounded-[24px] p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-natural-sage shrink-0" />
            <p className="text-sm font-bold text-[#1A1A1A]">Signed in as admin. Editing is enabled.</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-4 py-2 border border-natural-border text-natural-forest hover:bg-natural-cream text-xs font-bold rounded-xl transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      ) : isSetup && !auth.setupAllowed ? (
        <div className="bg-natural-sand/10 border border-natural-sand/30 text-natural-sand px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 mt-0.5" />
          <span>No admin password is configured yet. It can only be created from the machine running the server (localhost).</span>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-natural-cream/20 border border-natural-border p-6 rounded-[24px] space-y-4"
        >
          {isSetup && (
            <p className="text-sm font-bold text-[#1A1A1A]">
              No admin password is set yet. Create one to enable editing (minimum 8 characters).
            </p>
          )}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">
              {isSetup ? "New Admin Password" : "Admin Password"}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                className="w-full bg-white border border-natural-border rounded-xl pl-4 pr-11 py-3 text-sm text-natural-forest focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-natural-sage hover:text-natural-forest transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {isSetup && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-white border border-natural-border rounded-xl px-4 py-3 text-sm text-natural-forest focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150"
              />
            </div>
          )}

          {error && (
            <div className="bg-natural-sand/10 border border-natural-sand/30 text-natural-sand px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!password || submitting}
              className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] disabled:opacity-50 disabled:cursor-not-allowed text-white font-serif font-bold px-6 py-2.5 rounded-xl text-sm transition duration-150 shadow-sm"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isSetup ? "Create Admin Password" : "Sign In"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SettingsPanel({ className, auth, onAuthChange }: SettingsPanelProps) {
  return (
    <div
      className={`bg-white rounded-[32px] border border-natural-border p-8 shadow-sm space-y-8 animate-fade-in ${className ?? ""}`}
      id="settings-panel"
    >
      <AdminAccessSection auth={auth} onAuthChange={onAuthChange} />
    </div>
  );
}
