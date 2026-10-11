import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
};

/** Label + input + validation messages, wired up for screen readers. */
export function FormField({ name, label, errors, hint, className, ...props }: FormFieldProps) {
  const hasError = Boolean(errors && errors.length > 0);
  const describedBy = hasError ? `${name}-error` : hint ? `${name}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        {...props}
      />
      {hasError ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {errors?.join(" ")}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      )}
    >
      {children}
    </div>
  );
}
