import { useEffect, useState } from "react";

/** Two-step inline confirm — first click asks, second click within a few seconds fires. No modal needed for a single irreversible action. */
export function ConfirmButton({
  onConfirm,
  disabled,
  className = "danger",
  label,
  confirmLabel = "Click again to confirm",
}: {
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  label: string;
  confirmLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (confirming) {
    return (
      <button
        className={className}
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
    );
  }

  return (
    <button className={className} disabled={disabled} onClick={() => setConfirming(true)}>
      {label}
    </button>
  );
}
