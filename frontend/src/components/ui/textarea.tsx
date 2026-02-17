import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[130px] w-full rounded-md border border-kb-line bg-kb-panel px-3 py-2 text-sm text-kb-ink ring-offset-kb-panel placeholder:text-kb-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kb-accent/35 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
