import type { LabelHTMLAttributes } from 'react';

export function Label({ className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide font-medium ${className}`}
      {...props}
    />
  );
}
