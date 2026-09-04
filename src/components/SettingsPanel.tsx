import { useState, useEffect, FormEvent } from "react";
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

interface SettingsPanelProps {
  className?: string;
}

interface SettingsStatusResponse {
  geminiApiKeyConfigured: boolean;
}

export default function SettingsPanel({ className }: SettingsPanelProps) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [statusError, setStatusError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = async () => {
    setCheckingStatus(true);
    setStatusError("");
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        throw new Error("Unable to load the current key status. Please refresh and try again.");
      }
      const data: SettingsStatusResponse = await res.json();
      const isConfigured = !!data.geminiApiKeyConfigured;
      setConfigured(isConfigured);
      // Keep the form open if a key isn't set yet (there's nothing to "replace"),
      // otherwise start collapsed behind a "Replace Key" toggle.
      setShowForm((prev) => (isConfigured ? prev : true));
    } catch (err: any) {
      setStatusError(err?.message || "Unable to load the current key status. Please refresh and try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey || submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: trimmedKey }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Response may not have a JSON body; fall through to status check below.
      }

      if (!res.ok) {
        throw new Error((data && data.error) || "Failed to save the API key. Please try again.");
      }

      setApiKey("");
      setShowKey(false);
      setMessage({ type: "success", text: "Gemini API key saved! The Smart Document Parser will use it from now on." });
      setShowForm(false);
      await fetchStatus();
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to save the API key. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = apiKey.trim().length > 0 && !submitting;

  return (
    <div
      className={`bg-white rounded-[32px] border border-natural-border p-8 shadow-sm space-y-8 animate-fade-in ${className ?? ""}`}
      id="settings-panel"
    >
      {/* Header */}
      <div className="border-b border-natural-border pb-6">
        <h2 className="text-2xl font-serif font-bold text-[#1A1A1A] flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-natural-sage" />
          AI Parser Settings
        </h2>
        <p className="text-sm text-natural-sage mt-1 font-medium">
          Add a Gemini API key to power the Smart Document Parser, or leave it unset and we'll quietly use our built-in local parser instead.
        </p>
      </div>

      {/* Inline feedback */}
      {message && message.type === "success" && (
        <div className="bg-[#CCD5AE]/20 border border-[#CCD5AE]/60 text-natural-forest px-4 py-3 rounded-xl text-sm flex items-center gap-2.5 animate-bounce-subtle">
          <CheckCircle2 className="h-4 w-4 text-natural-sage shrink-0" />
          <span className="font-medium">{message.text}</span>
        </div>
      )}
      {message && message.type === "error" && (
        <div className="bg-natural-sand/10 border border-natural-sand/30 text-natural-sand px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}
      {statusError && (
        <div className="bg-natural-sand/10 border border-natural-sand/30 text-natural-sand px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-natural-sand shrink-0 mt-0.5" />
          <span>{statusError}</span>
        </div>
      )}

      {/* Current status */}
      {checkingStatus ? (
        <div className="flex items-center gap-3 text-natural-sage text-sm font-medium py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking current key status...
        </div>
      ) : configured ? (
        <div className="bg-natural-cream/30 border border-natural-border rounded-[24px] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white rounded-xl border border-natural-border/60 text-natural-sage shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-[#1A1A1A]">A Gemini API key is currently configured</p>
              <p className="text-xs text-natural-sage font-medium">
                For your security, the stored key is never displayed or sent back to the browser.
              </p>
              <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="h-2 w-2 rounded-full bg-natural-sage/50" />
                ))}
              </div>
            </div>
          </div>

          {!showForm && (
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setMessage(null);
              }}
              className="text-xs font-bold text-natural-forest hover:underline"
            >
              Replace Key
            </button>
          )}
        </div>
      ) : (
        <div className="bg-natural-wheat/20 border border-[#CCD5AE]/40 rounded-[24px] p-6 space-y-1">
          <p className="text-sm font-bold text-[#1A1A1A]">No Gemini API key set, and that's okay!</p>
          <p className="text-xs text-natural-sage font-medium leading-relaxed">
            This key is entirely optional. When set, it lets the Smart Document Parser use Gemini AI to read uploaded attendance files (Excel, Word, or text). Without one, the app automatically falls back to our built-in local parser, so everything still works.
          </p>
        </div>
      )}

      {/* Key entry form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-natural-cream/20 border border-natural-border p-6 rounded-[24px] space-y-4 animate-slide-down"
        >
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-natural-forest/80">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your Gemini API key..."
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-white border border-natural-border rounded-xl pl-4 pr-11 py-3 text-sm text-natural-forest placeholder-natural-sage/50 focus:outline-none focus:ring-2 focus:ring-natural-sage/20 focus:border-natural-sage transition duration-150 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-natural-sage hover:text-natural-forest transition"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-natural-sage/90 font-medium">
              Your key is sent straight to the server and stored there. It won't be shown again once saved.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            {configured && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setApiKey("");
                  setShowKey(false);
                  setMessage(null);
                }}
                className="px-5 py-2.5 border border-natural-border text-natural-forest/70 hover:bg-natural-cream text-sm font-semibold rounded-xl transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 bg-natural-forest hover:bg-[#213028] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-natural-forest text-white font-serif font-bold px-6 py-2.5 rounded-xl text-sm transition duration-150 shadow-sm"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{submitting ? "Saving..." : "Save Key"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
