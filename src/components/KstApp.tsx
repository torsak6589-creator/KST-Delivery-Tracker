"use client";

import { useEffect, useRef } from "react";
// @ts-ignore — plain JS module, no types
import { mountKstApp } from "@/lib/kst-ui.js";

export default function KstApp({ initialData }: { initialData: any }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const app = mountKstApp(ref.current, {
      initialData,
      // Upload a file to the server; returns { imported, data }.
      uploadFile: async (file: File) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/import", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "import failed");
        return json;
      },
      // Build a download URL for the filtered export.
      exportHref: (p: Record<string, string>) => {
        const qs = new URLSearchParams(p as any).toString();
        return "/api/export?" + qs;
      },
    });
    return () => app.destroy();
    // initialData is the server snapshot; remount only if it changes identity.
  }, [initialData]);

  return <div ref={ref} style={{ height: "100vh", width: "100%" }} />;
}
