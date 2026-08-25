import { useEffect, useState } from "react";

export interface Toast { id: number; message: string; type: "ok" | "err" }

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function toast(message: string, type: Toast["type"] = "ok") {
  const t = { id: nextId++, message, type };
  toasts = [...toasts, t];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    notify();
  }, 3200);
}

export function useToasts(): Toast[] {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return toasts;
}
