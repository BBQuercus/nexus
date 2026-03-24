import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 resize-none font-mono transition-colors ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
