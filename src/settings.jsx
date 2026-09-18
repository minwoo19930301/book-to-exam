import { createContext, useContext, useEffect, useState } from "react";

const KEY = "bve-settings";
const defaults = { fontSize: 16, lineHeight: 1.7, dark: false };
const Ctx = createContext({ s: defaults, setS: () => {} });

export function SettingsProvider({ children }) {
  const [s, setS] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { return defaults; }
  });
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(s));
    document.documentElement.dataset.theme = s.dark ? "dark" : "light";
    document.documentElement.style.setProperty("--fs", s.fontSize + "px");
    document.documentElement.style.setProperty("--lh", String(s.lineHeight));
  }, [s]);
  return <Ctx.Provider value={{ s, setS }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}

export function sessionId() {
  let id = localStorage.getItem("bve-sid");
  if (!id) {
    id = "bve_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem("bve-sid", id);
  }
  return id;
}

export function rememberKey(provider, key) {
  if (key && key.trim().length > 8) {
    sessionStorage.setItem("bve-last-key", key.trim());
    sessionStorage.setItem("bve-last-provider", provider);
    localStorage.setItem("bve-used-key", "1");
  }
}

export function lastKey() {
  return {
    key: sessionStorage.getItem("bve-last-key") || "",
    provider: sessionStorage.getItem("bve-last-provider") || "gemini",
    used: localStorage.getItem("bve-used-key") === "1",
  };
}
