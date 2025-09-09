"use client";
import { useEffect, useState } from "react";

export default function LegacyHtml() {
  const [html, setHtml] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/legacy.html", { cache: "no-store" });
        setHtml(await res.text());
      } catch (e) { setHtml(`<div style='color:#b91c1c'>Erreur chargement legacy.html</div>`); }
    })();
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}