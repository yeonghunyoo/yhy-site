import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "ghost" | "outline" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  ghost: "text-muted hover:text-text hover:bg-surface",
  outline: "border border-line text-text hover:bg-surface",
  danger: "text-danger hover:bg-danger/10",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; size?: "sm" | "md" }
>(function Button({ variant = "outline", icon, size = "md", className = "", children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"
      } ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  className = "",
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
        active ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-text"
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent ${className}`} />;
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-line ${className}`}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface text-faint">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      {children && <div className="text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

/** 네이티브 <dialog> 기반 모달 (포커스 가두기·Esc 닫기는 브라우저가 처리) */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton icon="close" label="닫기" onClick={onClose} className="-mr-2" />
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-line p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
          }`}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, image, size = 28 }: { name: string; image?: string | null; size?: number }) {
  if (image) return <img src={image} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  // 이름에서 색상을 만들되, 무채색에 가까운 톤으로 (테마와 어울리게)
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{ width: size, height: size, background: `oklch(0.75 0.05 ${h})`, color: "oklch(0.25 0.02 70)" }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-10 rounded-xl border border-line bg-bg px-3 text-sm text-text outline-none placeholder:text-faint focus:border-accent";
