"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { applyTheme, useSettings } from "@/store/settings";
import { useActiveSong, useSongs } from "@/store/songs";
import { useEditor } from "@/store/editor";
import { AssistantPanel } from "../assistant/assistant-panel";
import { SongSheet } from "../editor/song-sheet";
import { cn } from "../ui/primitives";
import { Dialogs, useDialogs } from "./dialogs";
import { EditorToolbar, MobileTransposeBar } from "./editor-toolbar";
import { EmptyState } from "./empty-state";
import { SongHeader } from "./song-header";
import { Sidebar } from "./sidebar";

export function Workspace() {
  const hydrated = useSongs((s) => s.hydrated);
  const song = useActiveSong();
  const theme = useSettings((s) => s.theme);
  const assistantOpen = useSettings((s) => s.assistantOpen);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isWide = useMediaQuery("(min-width: 1280px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    void useSongs.getState().hydrate();
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyTheme("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme]);

  // Close transient editor state when switching songs.
  useEffect(() => {
    useEditor.getState().clear();
  }, [song?.id]);

  // On tablet widths the assistant is an overlay: start closed so the editor is visible.
  useEffect(() => {
    if (!isWide) useSettings.getState().set({ assistantOpen: false });
  }, [isWide]);

  useGlobalShortcuts();

  if (!hydrated) return <LoadingShell />;

  const overlayAssistant = !isWide;

  return (
    <div className="flex h-full bg-canvas text-ink">
      {/* Sidebar: docked on desktop, drawer on tablet */}
      {isDesktop ? (
        <Sidebar />
      ) : (
        sidebarOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] animate-fade" onClick={() => setSidebarOpen(false)} />
            <div className="fixed inset-y-0 left-0 z-50 animate-slide-in shadow-lg [animation-direction:reverse]">
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </div>
          </>
        )
      )}

      <main className="flex min-w-0 flex-1 flex-col print-flat">
        {song ? (
          <>
            <EditorToolbar song={song} onOpenSidebar={isDesktop ? undefined : () => setSidebarOpen(true)} />
            <div data-sheet-scroller className="relative min-h-0 flex-1 overflow-auto print-flat">
              <div className="mx-auto w-full max-w-[820px] px-6 pb-40 pt-10 sm:px-14 print-flat">
                <SongHeader song={song} />
                <SongSheet song={song} />
              </div>
            </div>
            <MobileTransposeBar song={song} />
          </>
        ) : (
          <EmptyState onOpenSidebar={isDesktop ? undefined : () => setSidebarOpen(true)} />
        )}
      </main>

      {song && assistantOpen && (
        <>
          {overlayAssistant && (
            <div
              className="no-print fixed inset-0 z-40 bg-black/20 animate-fade"
              onClick={() => useSettings.getState().set({ assistantOpen: false })}
            />
          )}
          <aside
            className={cn(
              "no-print flex w-[360px] shrink-0 flex-col border-l border-line bg-surface",
              overlayAssistant && "fixed inset-y-0 right-0 z-50 max-w-[92vw] animate-slide-in shadow-lg",
            )}
          >
            <AssistantPanel song={song} />
          </aside>
        </>
      )}
      <Dialogs />
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex h-full">
      <div className="hidden w-[260px] border-r border-line bg-subtle/60 lg:block" />
      <div className="flex-1">
        <div className="h-12 border-b border-line" />
        <div className="mx-auto max-w-[820px] space-y-6 px-14 pt-12">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-muted/70" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(q);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
    () => true,
  );
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (mod && e.key === "/") {
        e.preventDefault();
        const s = useSettings.getState();
        s.set({ assistantOpen: !s.assistantOpen });
      } else if (mod && e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useSongs.getState().createSong();
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useEditor.getState().clear();
        setTimeout(() => window.print(), 50);
      } else if (!typing && !mod && e.key === "?") {
        e.preventDefault();
        useDialogs.getState().open("shortcuts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
