"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ShortcutProvider.module.css";

interface PageShortcutActions {
  calculate?: () => void;
  save?: () => void;
}

interface ShortcutContextValue {
  registerActions: (actions: PageShortcutActions) => () => void;
  openGuide: () => void;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

const navigation: Record<string, Route> = {
  d: "/",
  m: "/market",
  c: "/craft",
  p: "/plans",
  r: "/prestige",
  s: "/settings",
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable=true]");
}

export function ShortcutProvider({ children, onRefresh, refreshDisabled }: { children: ReactNode; onRefresh: () => void; refreshDisabled: boolean }) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);
  const actions = useRef<PageShortcutActions>({});
  const prefixTimer = useRef<number | null>(null);
  const awaitingDestination = useRef(false);
  const registerActions = useCallback((next: PageShortcutActions) => {
    actions.current = next;
    return () => {
      if (actions.current === next) actions.current = {};
    };
  }, []);
  const openGuide = useCallback(() => setGuideOpen(true), []);

  useEffect(() => {
    const clearPrefix = () => {
      awaitingDestination.current = false;
      if (prefixTimer.current !== null) window.clearTimeout(prefixTimer.current);
      prefixTimer.current = null;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);

      if (event.ctrlKey && !event.altKey && !event.metaKey && key === "enter") {
        if (actions.current.calculate) {
          event.preventDefault();
          actions.current.calculate();
        }
        return;
      }
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && key === "s") {
        if (actions.current.save) {
          event.preventDefault();
          actions.current.save();
        }
        return;
      }
      if (typing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.shiftKey && key === "r") {
        if (!refreshDisabled) {
          event.preventDefault();
          onRefresh();
        }
        return;
      }
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setGuideOpen(true);
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        const search = document.querySelector<HTMLElement>("[data-hotkey-search]");
        if (search) search.focus();
        else router.push("/market?focus=search" as Route);
        return;
      }
      if (event.shiftKey) return;
      if (awaitingDestination.current) {
        const destination = navigation[key];
        clearPrefix();
        if (destination) {
          event.preventDefault();
          router.push(destination);
        }
        return;
      }
      if (key === "g") {
        awaitingDestination.current = true;
        prefixTimer.current = window.setTimeout(clearPrefix, 1_200);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      clearPrefix();
    };
  }, [onRefresh, refreshDisabled, router]);

  return <ShortcutContext.Provider value={{ registerActions, openGuide }}>
    {children}
    <Dialog.Root open={guideOpen} onOpenChange={setGuideOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby="shortcut-guide-description">
          <div className={styles.header}>
            <div><Dialog.Title className={styles.title}>Keyboard shortcuts</Dialog.Title><Dialog.Description id="shortcut-guide-description" className={styles.description}>Navigate and run primary actions without leaving the keyboard.</Dialog.Description></div>
            <Dialog.Close className={styles.close} aria-label="Close shortcut guide">×</Dialog.Close>
          </div>
          <div className={styles.list}>
            <Shortcut keys="G then D / M / C / P / R / S" action="Open a main workspace" />
            <Shortcut keys="Ctrl + Enter" action="Calculate Craft Lab plan" />
            <Shortcut keys="Ctrl + Shift + S" action="Save Craft Lab plan" />
            <Shortcut keys="Shift + R" action="Refresh market" />
            <Shortcut keys="/" action="Focus market search" />
            <Shortcut keys="?" action="Open this guide" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </ShortcutContext.Provider>;
}

function Shortcut({ keys, action }: { keys: string; action: string }) {
  return <div className={styles.row}><kbd>{keys}</kbd><span>{action}</span></div>;
}

export function useShortcutActions(actions: PageShortcutActions) {
  const context = useContext(ShortcutContext);
  useEffect(() => context?.registerActions(actions), [actions, context]);
}

export function ShortcutGuideButton() {
  const context = useContext(ShortcutContext);
  return <button type="button" className={styles.guideButton} aria-label="Keyboard shortcuts" aria-keyshortcuts="?" title="Keyboard shortcuts (?)" onClick={context?.openGuide}>?</button>;
}
