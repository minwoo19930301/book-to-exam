import { createContext, useContext, useEffect } from "react";
import { scoreLocal } from "./text.js";

export const GuideMode = createContext(null);

export function useGuide() {
  return useContext(GuideMode);
}

function wrongOf(q, kind) {
  if (kind === "mc") return Number(q.answer) === 0 ? 1 : 0;
  return "아무말";
}

function typeValue(setVal, fill, kind) {
  if (kind === "mc") {
    setVal("");
    const t = setTimeout(() => setVal(fill), 700);
    return () => clearTimeout(t);
  }
  setVal("");
  let i = 0;
  const id = setInterval(() => {
    i += 1;
    setVal(String(fill).slice(0, i));
    if (i >= String(fill).length) clearInterval(id);
  }, 80);
  return () => clearInterval(id);
}

export function useExamPlay({ q, setVal, setResult, kind }) {
  const guide = useGuide();

  useEffect(() => {
    if (!guide?.demo || !q) return undefined;
    const fill = kind === "mc" ? q.answer : String(q.answer || "");
    const bad = wrongOf(q, kind);

    if (guide.phase === "type-wrong") {
      setResult(null);
      return typeValue(setVal, bad, kind);
    }
    if (guide.phase === "wrong") {
      setVal(bad);
      setResult(scoreLocal(q, bad));
      return undefined;
    }
    if (guide.phase === "type") {
      setResult(null);
      return typeValue(setVal, fill, kind);
    }
    if (guide.phase === "grade") {
      setVal(fill);
      setResult(null);
    }
    if (guide.phase === "result") {
      setVal(fill);
      setResult(scoreLocal(q, fill));
    }
    return undefined;
  }, [guide?.demo, guide?.phase, q, kind, setVal, setResult]);
}
