"use client";

import clsx from "clsx";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const cn = clsx;

type Variant = "ghost" | "outline" | "primary" | "soft";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  ghost: "text-ink-2 hover:bg-muted/70 hover:text-ink",
  outline: "border border-line bg-surface text-ink-2 shadow-sm hover:border-line-strong hover:text-ink",
  primary: "bg-accent text-white shadow-sm hover:bg-accent-hover dark:text-[#0b1120]",
  soft: "bg-accent-soft text-accent-ink hover:bg-accent-soft/70",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: boolean }
>(function Button({ variant = "ghost", size = "md", icon, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 text-[12.5px]" : "h-8 text-[13px]",
        icon ? (size === "sm" ? "w-7" : "w-8") : size === "sm" ? "px-2" : "px-2.5",
        variants[variant],
        className,
      )}
    />
  );
});

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-subtle px-1 font-sans text-[10.5px] font-medium text-ink-3",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Lightweight hover tooltip. */
export function Tip({
  label,
  shortcut,
  children,
  side = "bottom",
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  side?: "bottom" | "top" | "right";
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11.5px] font-medium text-canvas opacity-0 shadow-md transition-opacity delay-0 duration-100 group-hover/tip:opacity-100 group-hover/tip:delay-500",
          side === "bottom" && "left-1/2 top-full mt-1.5 -translate-x-1/2",
          side === "top" && "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
          side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
        )}
      >
        {label}
        {shortcut && <span className="text-ink-4">{shortcut}</span>}
      </span>
    </span>
  );
}

export function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, onClose, ref]);
}

export function Popover({
  trigger,
  children,
  align = "start",
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      setInnerOpen(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, ref);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-1.5 animate-fade rounded-lg border border-line bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  shortcut,
  danger,
  onClick,
  disabled,
  active,
}: {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  danger?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors disabled:opacity-40",
        danger ? "text-danger hover:bg-danger/10" : "text-ink-2 hover:bg-subtle hover:text-ink",
        active && "bg-subtle text-ink",
      )}
    >
      {icon && <span className="flex w-4 shrink-0 justify-center text-ink-3 [&>svg]:size-[15px]">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-[11px] text-ink-4">{shortcut}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">{children}</div>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center gap-1 rounded-[5px] px-2 text-[12.5px] font-medium transition-all",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = () => (isMac() ? "⌘" : "Ctrl+");
