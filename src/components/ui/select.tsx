import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select, styled to match Input. Works without JavaScript. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";
