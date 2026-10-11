"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border bg-card px-4 py-12 text-center"
    >
      <p className="text-sm font-medium">Something went wrong loading this page.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Try again. If it keeps happening, contact your administrator
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <Button type="button" variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
