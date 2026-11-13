"use client";

import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Plus, Tag, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import {
  addSection,
  appendLine,
  deleteSection,
  duplicateSection,
  moveSection,
  updateSection,
} from "@/lib/song/ops";
import { SECTION_TYPES, type Section, type SectionType, uid } from "@/lib/song/types";
import { useEditor } from "@/store/editor";
import { useSongs } from "@/store/songs";
import { MenuItem, MenuLabel, MenuSeparator, Popover, cn } from "../ui/primitives";
import { LineRow } from "./lyric-line";

export const SECTION_TONE: Record<SectionType, string> = {
  intro: "text-ink-3",
  verse: "text-ink-2",
  prechorus: "text-ink-2",
  chorus: "text-accent",
  bridge: "text-ink-2",
  instrumental: "text-ink-3",
  tag: "text-ink-3",
  outro: "text-ink-3",
};

export const SectionBlock = memo(function SectionBlock({
  section,
  index,
  total,
}: {
  section: Section;
  index: number;
  total: number;
}) {
  const commit = useSongs((s) => s.commit);
  const renaming = useEditor((s) => s.renaming === section.id);
  const isChorus = section.type === "chorus";

  return (
    <section
      className={cn(
        "section-block group/section relative",
        isChorus && "before:absolute before:-left-5 before:bottom-[var(--line-gap)] before:top-1 before:w-[2px] before:rounded-full before:bg-accent/35",
      )}
    >
      <header className="mb-1 flex h-7 items-center gap-2">
        {renaming ? (
          <LabelInput section={section} />
        ) : (
          <button
            type="button"
            onClick={() => useEditor.getState().setRenaming(section.id)}
            className={cn(
              "-ml-1 rounded px-1 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-subtle",
              SECTION_TONE[section.type],
            )}
            title="Rename section"
          >
            {section.label}
          </button>
        )}
        <div className="no-print flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/section:opacity-100 [@media(hover:none)]:opacity-100">
          <Popover
            trigger={({ toggle, open }) => (
              <button
                type="button"
                aria-label="Section actions"
                onClick={toggle}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-muted hover:text-ink",
                  open && "bg-muted text-ink",
                )}
              >
                <MoreHorizontal size={15} />
              </button>
            )}
            className="w-56"
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<Tag />}
                  onClick={() => {
                    useEditor.getState().setRenaming(section.id);
                    close();
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  icon={<ArrowUp />}
                  disabled={index === 0}
                  onClick={() => {
                    commit((s) => moveSection(s, section.id, -1));
                    close();
                  }}
                >
                  Move up
                </MenuItem>
                <MenuItem
                  icon={<ArrowDown />}
                  disabled={index === total - 1}
                  onClick={() => {
                    commit((s) => moveSection(s, section.id, 1));
                    close();
                  }}
                >
                  Move down
                </MenuItem>
                <MenuItem
                  icon={<Copy />}
                  onClick={() => {
                    commit((s) => duplicateSection(s, section.id));
                    close();
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuSeparator />
                <MenuLabel>Section type</MenuLabel>
                <div className="grid grid-cols-2 gap-0.5">
                  {SECTION_TYPES.map((t) => (
                    <MenuItem
                      key={t.type}
                      active={t.type === section.type}
                      onClick={() => {
                        commit((s) => updateSection(s, section.id, { type: t.type }));
                        close();
                      }}
                    >
                      {t.label}
                    </MenuItem>
                  ))}
                </div>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Trash2 />}
                  onClick={() => {
                    commit((s) => deleteSection(s, section.id));
                    close();
                  }}
                >
                  Delete section
                </MenuItem>
              </>
            )}
          </Popover>
          <AddSectionMenu afterId={section.id} compact />
        </div>
      </header>

      <div>
        {section.lines.map((line, i) => (
          <LineRow key={line.id} line={line} sectionId={section.id} isLastInSection={i === section.lines.length - 1} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          const id = uid();
          commit((s) => appendLine(s, section.id, id));
          useEditor.getState().editLine(id, 0);
        }}
        className="no-print -mt-1 flex h-6 items-center gap-1 rounded px-1 text-[12px] text-ink-4 opacity-0 transition-opacity hover:text-ink-2 group-hover/section:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Plus size={12} /> Line
      </button>
    </section>
  );
});

function LabelInput({ section }: { section: Section }) {
  const [value, setValue] = useState(section.label);
  const ref = useRef<HTMLInputElement>(null);
  const commit = useSongs((s) => s.commit);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (save: boolean) => {
    if (save && value.trim()) commit((s) => updateSection(s, section.id, { label: value.trim() }));
    useEditor.getState().setRenaming(null);
  };
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      className="-ml-1 h-6 w-48 rounded border border-accent bg-surface px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink outline-none ring-4 ring-accent/15"
    />
  );
}

export function AddSectionMenu({ afterId, compact }: { afterId?: string; compact?: boolean }) {
  const commit = useSongs((s) => s.commit);
  const add = (type: SectionType) => {
    const ids = { section: uid(), line: uid() };
    commit((s) => addSection(s, type, afterId, ids));
    useEditor.getState().editLine(ids.line, 0);
  };
  return (
    <Popover
      trigger={({ toggle, open }) =>
        compact ? (
          <button
            type="button"
            aria-label="Insert section below"
            title="Insert section below"
            onClick={toggle}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-muted hover:text-ink",
              open && "bg-muted text-ink",
            )}
          >
            <Plus size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 text-[13px] text-ink-3 transition-colors hover:border-accent hover:bg-accent-softer hover:text-accent",
              open && "border-accent text-accent",
            )}
          >
            <Plus size={14} /> Add section
          </button>
        )
      }
      className="w-48"
    >
      {(close) =>
        SECTION_TYPES.map((t) => (
          <MenuItem
            key={t.type}
            onClick={() => {
              add(t.type);
              close();
            }}
          >
            {t.label}
          </MenuItem>
        ))
      }
    </Popover>
  );
}
