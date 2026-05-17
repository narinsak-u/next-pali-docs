"use client";

import { RootProvider } from "fumadocs-ui/provider";
import { useState, type ReactNode, useEffect } from "react";
import { ThemeProvider } from "@/lib/contexts/theme-context";

export function Provider({ children }: { children: ReactNode }) {
  const [isMount, setIsMount] = useState(false);

  useEffect(() => {
    setIsMount(true);
  }, [isMount]);

  if (!isMount) return null;

  return (
    <ThemeProvider>
      <RootProvider
        search={{
          enabled: false,
        }}
      >
        {children}
      </RootProvider>
    </ThemeProvider>
  );
}