"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import type { ButtonProps } from "@/components/ui/button";

/** Submit button that asks for confirmation first. */
export function ConfirmButton({ message, ...props }: ButtonProps & { message: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    />
  );
}
