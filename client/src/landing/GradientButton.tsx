import * as React from "react";

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export default function GradientButton({ children, icon, className = "", ...props }: GradientButtonProps) {
  return (
    <button
      className={["gradient-cta inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold", className].filter(Boolean).join(" ")}
      {...props}
    >
      <span className="gradient-cta-text">{children}</span>
      {icon ? <span className="inline-flex items-center">{icon}</span> : null}
    </button>
  );
}
