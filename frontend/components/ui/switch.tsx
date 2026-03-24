interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

export function Switch({ checked, onCheckedChange, className = '' }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors duration-200 ${
        checked ? 'bg-accent' : 'bg-surface-2'
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        } ${!checked ? 'opacity-60' : ''}`}
      />
    </button>
  );
}
