import { Lock } from "lucide-react";

interface ReadOnlyNoticeProps {
  onSignIn?: () => void;
}

// Shown on tabs with mutating actions when there's no admin session (US-11).
export default function ReadOnlyNotice({ onSignIn }: ReadOnlyNoticeProps) {
  return (
    <div
      className="bg-natural-wheat/30 border border-natural-border text-natural-forest px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3"
      id="read-only-notice"
    >
      <span className="flex items-center gap-2 font-medium">
        <Lock className="h-4 w-4 text-natural-sage shrink-0" />
        Read-only mode. Sign in as admin in Settings to make changes.
      </span>
      {onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="text-xs font-bold text-natural-forest hover:underline whitespace-nowrap"
        >
          Sign In
        </button>
      )}
    </div>
  );
}
