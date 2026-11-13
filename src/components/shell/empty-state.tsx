"use client";

import { FileUp, Menu, Plus } from "lucide-react";
import { useSongs } from "@/store/songs";
import { Button } from "../ui/primitives";
import { useDialogs } from "./dialogs";

export function EmptyState({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      {onOpenSidebar && (
        <div className="flex h-12 items-center px-2">
          <Button icon aria-label="Open library" onClick={onOpenSidebar}>
            <Menu size={17} />
          </Button>
        </div>
      )}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="text-[20px] font-semibold tracking-[-0.015em]">Start a song</h2>
        <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-ink-2">
          Write from scratch, or paste lyrics you already have — chords in them are recognised automatically.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" onClick={() => useSongs.getState().createSong()}>
            <Plus size={15} /> New song
          </Button>
          <Button variant="outline" onClick={() => useDialogs.getState().open("import")}>
            <FileUp size={15} /> Import lyrics
          </Button>
        </div>
      </div>
    </div>
  );
}
