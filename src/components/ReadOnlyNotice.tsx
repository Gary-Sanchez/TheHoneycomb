import { Lock } from "lucide-react";
import { Button } from "./ui";

interface ReadOnlyNoticeProps {
  onSignIn?: () => void;
}

// Shown on tabs with mutating actions when there's no admin session (US-11). US-59: design tokens
// only, and always right below the tab's h2 (each tab renders it after its header).
export default function ReadOnlyNotice({ onSignIn }: ReadOnlyNoticeProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-control border border-border bg-wheat/30 px-4 py-3 text-body text-forest"
      id="read-only-notice"
    >
      <span className="flex items-center gap-2 font-medium">
        <Lock className="size-4 shrink-0 text-sage" aria-hidden="true" />
        Read-only mode. Sign in as admin in Settings to make changes.
      </span>
      {onSignIn && (
        <Button variant="link" size="sm" onClick={onSignIn}>
          Sign In
        </Button>
      )}
    </div>
  );
}
