import * as React from "react";
import { cn } from "../lib/utils.js";

// A plain, dependency-free stand-in for radix-ui's Separator — this only ever
// renders a visual rule in this app, so the extra package isn't worth pulling in.
export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: { orientation?: "horizontal" | "vertical" } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch", className)}
      {...props}
    />
  );
}
