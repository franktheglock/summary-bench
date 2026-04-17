import { CheckCircle2 } from "lucide-react";

const VERIFICATION_TOOLTIP = "This model has been verified to be the model it says it is.";

export default function VerificationBadge({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <span
      className="inline-flex items-center text-olive"
      title={VERIFICATION_TOOLTIP}
      aria-label={VERIFICATION_TOOLTIP}
    >
      <CheckCircle2 className={className} strokeWidth={2} />
    </span>
  );
}

export { VERIFICATION_TOOLTIP };
