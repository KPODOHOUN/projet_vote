import type { InputHTMLAttributes } from "react";

type InputState = "default" | "error" | "success";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helpText?: string;
  errorText?: string;
  successText?: string;
  state?: InputState;
}

export function Input({
  id,
  label,
  helpText,
  errorText,
  successText,
  state = "default",
  className = "",
  ...props
}: InputProps) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const successId = `${id}-success`;

  const describedBy = [
    state === "error" && errorText ? errorId : "",
    state === "success" && successText ? successId : "",
    state === "default" && helpText ? helpId : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inputClasses = [
    "vp-ui",
    "vp-input",
    "vp-focus-ring",
    state === "error" ? "vp-input-state-error" : "",
    state === "success" ? "vp-input-state-success" : "",
    className,
  ]
    .join(" ")
    .trim();

  return (
    <div className="vp-field">
      <label className="vp-label" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={describedBy || undefined}
        aria-invalid={state === "error" ? true : undefined}
        className={inputClasses}
        id={id}
        {...props}
      />
      {state === "error" && errorText ? (
        <p className="vp-help vp-help-error" id={errorId}>
          {errorText}
        </p>
      ) : null}
      {state === "success" && successText ? (
        <p className="vp-help vp-help-success" id={successId}>
          {successText}
        </p>
      ) : null}
      {state === "default" && helpText ? (
        <p className="vp-help" id={helpId}>
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
