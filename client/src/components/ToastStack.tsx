import { useToasts } from "../lib/toast.js";

export function ToastStack() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === "err" ? "err" : ""}`}>{t.message}</div>
      ))}
    </div>
  );
}
