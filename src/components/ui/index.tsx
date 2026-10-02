import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./ui.module.css";

function cx(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(" "); }

export function Button({ variant = "default", size = "default", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "quiet"; size?: "default" | "small" | "icon" }) {
  return <button className={cx(styles.button, styles[variant], size === "small" && styles.small, size === "icon" && styles.iconOnly, className)} {...props} />;
}

export function Card({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <section className={cx(styles.card, className)} {...props}>{children}</section>; }
export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) { return <header className={styles.cardHeader}><div><h2 className={styles.cardTitle}>{title}</h2>{description && <p className={styles.cardDescription}>{description}</p>}</div>{action}</header>; }
export function CardBody({ children, className }: { children: ReactNode; className?: string }) { return <div className={cx(styles.cardBody, className)}>{children}</div>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "negative" | "warning" }) { return <span className={cx(styles.badge, tone === "positive" && styles.badgePositive, tone === "negative" && styles.badgeNegative, tone === "warning" && styles.badgeWarning)}>{children}</span>; }
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) { return <label className={styles.field}><span className={styles.label}>{label}</span>{children}{help && <span className={styles.help}>{help}</span>}</label>; }
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, autoComplete = "off", name = "ascendry-input", ...props }, ref) { return <input ref={ref} className={cx(styles.input, className)} autoComplete={autoComplete} name={name} {...props} />; });
export function NativeSelect({ className, name = "ascendry-select", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cx(styles.select, className)} name={name} {...props} />; }
export function ErrorMessage({ children }: { children: ReactNode }) { return <div role="alert" className={styles.error}>{children}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div aria-live="polite" className={styles.notice}>{children}</div>; }
export { styles as uiStyles };
