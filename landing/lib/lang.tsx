"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { CONTENT, type Content, type Lang } from "./content";

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Content;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: CONTENT.en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("cocodes-lang");
    if (saved === "zh" || saved === "en") setLangState(saved);
    else if (navigator.language.toLowerCase().startsWith("zh"))
      setLangState("zh");
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem("cocodes-lang", next);
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t: CONTENT[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
