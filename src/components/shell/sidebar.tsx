"use client";

import {
  Clock,
  Copy,
  FileUp,
  Library,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { keyName, parseKey, transposeKey } from "@/lib/music/key";
import type { Song } from "@/lib/song/types";
import { useSettings } from "@/store/settings";
import { useSongs } from "@/store/songs";
import { MenuItem, MenuSeparator, Popover, Tip, cn } from "../ui/primitives";
import { useDialogs } from "./dialogs";

type View = "all" | "recent" | "favorites";

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="text-accent">
        <rect width="24" height="24" rx="6" fill="currentColor" />
        <path d="M8 6.5v11M12 6.5v11M16 6.5v11" stroke="white" strokeOpacity=".45" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M6.5 9.5h11" stroke="white" strokeOpacity=".7" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="12" cy="12.5" r="2.1" fill="white" />
        <circle cx="16" cy="15.3" r="1.6" fill="white" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.015em] text-ink">Transposer</span>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const songs = useSongs((s) => s.songs);
  const activeId = useSongs((s) => s.activeId);
  const { open, createSong } = useSongs.getState();
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const openDialog = useDialogs((s) => s.open);

  const list = useMemo(() => {
    let l = [...songs];
    if (view === "favorites") l = l.filter((s) => s.favorite);
    if (view === "recent") l = l.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 8);
    else l = l.sort((a, b) => a.title.localeCompare(b.title));
    const q = query.trim().toLowerCase();
    if (q) {
      l = l.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.sections.some((sec) => sec.lines.some((line) => line.text.toLowerCase().includes(q))),
      );
    }
    return l;
  }, [songs, view, query]);

  const favCount = songs.filter((s) => s.favorite).length;

  return (
    <nav className="no-print flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-subtle/60 dark:bg-canvas">
      <div className="flex h-12 items-center px-4">
        <Logo />
      </div>

      <div className="space-y-1 px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            createSong();
            onNavigate?.();
          }}
          className="flex h-8 w-full items-center gap-2 rounded-md bg-accent px-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover dark:text-[#0b1120]"
        >
          <Plus size={15} /> New song
        </button>
        <button
          type="button"
          onClick={() => openDialog("import")}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-muted hover:text-ink"
        >
          <FileUp size={15} /> Import lyrics
        </button>
      </div>

      <div className="px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-ink-3 focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
          <Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs & lyrics"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      <div className="space-y-px px-3 pb-2">
        <NavItem icon={<Library size={15} />} label="My Songs" count={songs.length} active={view === "all"} onClick={() => setView("all")} />
        <NavItem icon={<Clock size={15} />} label="Recent" active={view === "recent"} onClick={() => setView("recent")} />
        <NavItem icon={<Star size={15} />} label="Favorites" count={favCount} active={view === "favorites"} onClick={() => setView("favorites")} />
      </div>

      <div className="mx-3 h-px bg-line" />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {list.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] text-ink-3">
            {query ? "No songs match your search." : view === "favorites" ? "Star a song to keep it here." : "No songs yet."}
          </p>
        ) : (
          <ul className="space-y-px">
            {list.map((song) => (
              <SongItem
                key={song.id}
                song={song}
                active={song.id === activeId}
                onOpen={() => {
                  open(song.id);
                  onNavigate?.();
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={() => openDialog("settings")}
          className="flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-[13px] text-ink-2 transition-colors hover:bg-muted hover:text-ink"
        >
          <Settings size={15} /> Settings
        </button>
        <ThemeToggle />
      </div>
    </nav>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
        active ? "bg-surface font-medium text-ink shadow-sm dark:bg-muted" : "text-ink-2 hover:bg-muted/70 hover:text-ink",
      )}
    >
      <span className={cn(active ? "text-ink" : "text-ink-3")}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-[11.5px] tabular-nums text-ink-3">{count}</span>}
    </button>
  );
}

function currentKeyName(song: Song) {
  const k = parseKey(song.originalKey);
  return k ? keyName(transposeKey(k, song.transpose)) : song.originalKey;
}

function relTime(ts: number) {
  const d = Date.now() - ts;
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SongItem({ song, active, onOpen }: { song: Song; active: boolean; onOpen: () => void }) {
  const { duplicateSong, deleteSong, patchSong } = useSongs.getState();
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md py-1.5 pl-2 pr-8 text-left transition-colors",
          active ? "bg-surface shadow-sm dark:bg-muted" : "hover:bg-muted/70",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11.5px] font-semibold",
            active ? "bg-accent-soft text-accent-ink" : "bg-muted text-ink-2 dark:bg-subtle",
          )}
        >
          {currentKeyName(song)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-center gap-1 truncate text-[13px]", active ? "font-medium text-ink" : "text-ink")}>
            <span className="truncate">{song.title || "Untitled song"}</span>
            {song.favorite && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />}
          </span>
          <span className="block truncate text-[11.5px] text-ink-3">
            {song.artist ? `${song.artist} · ` : ""}
            {relTime(song.updatedAt)}
          </span>
        </span>
      </button>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100 [@media(hover:none)]:opacity-100">
        <Popover
          align="end"
          className="w-48"
          onOpenChange={(o) => !o && setConfirm(false)}
          trigger={({ toggle }) => (
            <button
              type="button"
              aria-label="Song actions"
              onClick={toggle}
              className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-line hover:text-ink"
            >
              <MoreHorizontal size={14} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Star />}
                onClick={() => {
                  patchSong(song.id, { favorite: !song.favorite });
                  close();
                }}
              >
                {song.favorite ? "Unfavorite" : "Favorite"}
              </MenuItem>
              <MenuItem
                icon={<Copy />}
                onClick={() => {
                  duplicateSong(song.id);
                  close();
                }}
              >
                Duplicate
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  onOpen();
                  setTimeout(() => {
                    const el = document.querySelector<HTMLInputElement>('input[aria-label="Song title"]');
                    el?.focus();
                    el?.select();
                  }, 60);
                }}
              >
                Rename…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 />}
                onClick={() => {
                  if (!confirm) return setConfirm(true);
                  deleteSong(song.id);
                  close();
                }}
              >
                {confirm ? "Click again to delete" : "Delete"}
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </li>
  );
}

function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Tip label={`Theme: ${theme}`} side="top">
      <button
        type="button"
        aria-label="Toggle theme"
        onClick={() => set({ theme: next })}
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-muted hover:text-ink"
      >
        <Icon size={15} />
      </button>
    </Tip>
  );
}
