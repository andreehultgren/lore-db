import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-kb-line bg-kb-panel px-3 py-2 text-sm text-kb-ink ring-offset-kb-panel file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-kb-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kb-accent/35 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
