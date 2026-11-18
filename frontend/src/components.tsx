import { AlertTriangle, CheckCircle2, FileCheck2, XCircle } from "lucide-react";
import { ChangeEvent, ReactNode } from "react";

export type StatusMessageType = "success" | "warning" | "error";

export function NavButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  const label = typeof children === "string" ? children : undefined;
  return (
    <button className={`nav-button ${active ? "nav-button--active" : ""}`} type="button" onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title__icon">{icon}</div>
      <h2>{title}</h2>
    </div>
  );
}

export function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function StepCard({ text, title }: { text: string; title: string }) {
  return (
    <article className="step-card">
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

export function Field({
  action,
  help,
  label,
  onChange,
  placeholder,
  value,
  wide = false,
}: {
  action?: ReactNode;
  help?: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "field--wide" : ""}`}>
      <span className="field__label">
        {label}
        {action}
      </span>
      {help ? <small>{help}</small> : null}
      <input placeholder={placeholder} value={value} onChange={onChange} />
    </label>
  );
}

export function TextArea({
  action,
  help,
  label,
  onChange,
  placeholder,
  tall = false,
  value,
}: {
  action?: ReactNode;
  help?: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  tall?: boolean;
  value: string;
}) {
  return (
    <label className={`field field--wide ${tall ? "field--tall" : ""}`}>
      <span className="field__label">
        {label}
        {action}
      </span>
      {help ? <small>{help}</small> : null}
      <textarea placeholder={placeholder} value={value} onChange={onChange} />
    </label>
  );
}

export function EmptyState({ text, title }: { text: string; title: string }) {
  return (
    <div className="empty-state">
      <FileCheck2 size={28} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export function StatusMessage({ text, type }: { text: string; type: StatusMessageType }) {
  const Icon = type === "error" ? XCircle : type === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`status-message status-message--${type}`}>
      <Icon size={17} />
      <span>{text}</span>
    </div>
  );
}
