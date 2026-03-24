import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={`w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
    </div>
  ),
);
Select.displayName = 'Select';
