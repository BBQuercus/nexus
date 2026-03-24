'use client';

/**
 * FormRenderer -- renders a create_ui form spec as an interactive form.
 *
 * Supports: text, textarea, number, select, multiselect, checkbox,
 * radio, date, slider, rating fields.
 * Handles: validation, conditional fields, default values, submission.
 */

import { useState, useCallback, useMemo } from 'react';
import { Check, Star, ChevronDown, Plus, Minus, ClipboardList } from 'lucide-react';
import type { FormSpec, FormField } from '@/lib/types';

interface FormRendererProps {
  spec: FormSpec;
  onSubmit?: (data: Record<string, unknown>) => void;
  compact?: boolean;
}

function getDefaultValue(field: FormField): unknown {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'date':
      return '';
    case 'number':
    case 'slider':
      return field.validation?.min ?? 0;
    case 'select':
    case 'radio':
      return '';
    case 'multiselect':
      return [];
    case 'checkbox':
      return false;
    case 'rating':
      return 0;
    default:
      return '';
  }
}

function TextInput({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ''}
      className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors"
    />
  );
}

function TextareaInput({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ''}
      rows={3}
      className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors resize-y min-h-[60px]"
    />
  );
}

function NumberInput({ field, value, onChange }: { field: FormField; value: number; onChange: (v: number) => void }) {
  const min = field.validation?.min;
  const max = field.validation?.max;

  const adjust = (delta: number) => {
    let next = value + delta;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => adjust(-1)}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-default bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary cursor-pointer transition-colors"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          let v = parseFloat(e.target.value);
          if (isNaN(v)) v = 0;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }}
        min={min}
        max={max}
        className="w-20 px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary text-center outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => adjust(1)}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-default bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary cursor-pointer transition-colors"
      >
        <Plus size={12} />
      </button>
      {min !== undefined && max !== undefined && (
        <span className="text-[10px] text-text-tertiary ml-1">{min} - {max}</span>
      )}
    </div>
  );
}

function SelectInput({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors cursor-pointer"
      >
        <option value="">{field.placeholder || 'Select...'}</option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
    </div>
  );
}

function MultiSelectInput({ field, value, onChange }: { field: FormField; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {field.options?.map((opt) => {
        const selected = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${
              selected
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-surface-1 border-border-default text-text-secondary hover:border-border-focus hover:text-text-primary'
            }`}
          >
            {selected && <Check size={10} className="inline mr-1" />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxInput({ field, value, onChange }: { field: FormField; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 cursor-pointer group"
    >
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
        value
          ? 'bg-accent border-accent'
          : 'bg-surface-1 border-border-default group-hover:border-border-focus'
      }`}>
        {value && <Check size={10} className="text-white" />}
      </div>
      <span className="text-xs text-text-secondary">{field.label}</span>
    </button>
  );
}

function RadioGroup({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {field.options?.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className="flex items-center gap-2 cursor-pointer group w-full text-left"
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            value === opt
              ? 'border-accent'
              : 'border-border-default group-hover:border-border-focus'
          }`}>
            {value === opt && <div className="w-2 h-2 rounded-full bg-accent" />}
          </div>
          <span className="text-xs text-text-secondary">{opt}</span>
        </button>
      ))}
    </div>
  );
}

function DateInput({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-text-primary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors [color-scheme:dark]"
    />
  );
}

function SliderInput({ field, value, onChange }: { field: FormField; value: number; onChange: (v: number) => void }) {
  const min = field.validation?.min ?? 0;
  const max = field.validation?.max ?? 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none bg-surface-2 cursor-pointer accent-[var(--color-accent)]
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-0
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface-0"
        />
        <span className="text-xs text-text-primary font-mono w-10 text-right">{value}</span>
      </div>
      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function RatingInput({ field, value, onChange }: { field: FormField; value: number; onChange: (v: number) => void }) {
  const max = field.validation?.max ?? 5;
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star === value ? 0 : star)}
          className="cursor-pointer transition-transform hover:scale-110"
        >
          <Star
            size={20}
            className={`transition-colors ${
              star <= (hover || value)
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-surface-2'
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="text-[10px] text-text-tertiary ml-1">{value}/{max}</span>
      )}
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const isCheckbox = field.type === 'checkbox';

  return (
    <div className="space-y-1.5">
      {!isCheckbox && (
        <label className="flex items-center gap-1 text-xs font-medium text-text-secondary">
          {field.label}
          {field.required && <span className="text-error text-[10px]">*</span>}
        </label>
      )}
      {field.type === 'text' && <TextInput field={field} value={value as string} onChange={onChange as (v: string) => void} />}
      {field.type === 'textarea' && <TextareaInput field={field} value={value as string} onChange={onChange as (v: string) => void} />}
      {field.type === 'number' && <NumberInput field={field} value={value as number} onChange={onChange as (v: number) => void} />}
      {field.type === 'select' && <SelectInput field={field} value={value as string} onChange={onChange as (v: string) => void} />}
      {field.type === 'multiselect' && <MultiSelectInput field={field} value={value as string[]} onChange={onChange as (v: string[]) => void} />}
      {field.type === 'checkbox' && <CheckboxInput field={field} value={value as boolean} onChange={onChange as (v: boolean) => void} />}
      {field.type === 'radio' && <RadioGroup field={field} value={value as string} onChange={onChange as (v: string) => void} />}
      {field.type === 'date' && <DateInput field={field} value={value as string} onChange={onChange as (v: string) => void} />}
      {field.type === 'slider' && <SliderInput field={field} value={value as number} onChange={onChange as (v: number) => void} />}
      {field.type === 'rating' && <RatingInput field={field} value={value as number} onChange={onChange as (v: number) => void} />}
      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
}

export default function FormRenderer({ spec, onSubmit, compact }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const field of spec.fields) {
      init[field.id] = getDefaultValue(field);
    }
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);

  const visibleFields = useMemo(() => {
    return spec.fields.filter((field) => {
      if (!field.condition) return true;
      const depValue = values[field.condition.field];
      return depValue === field.condition.equals;
    });
  }, [spec.fields, values]);

  const setValue = useCallback((id: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of visibleFields) {
      const val = values[field.id];

      // Required check
      if (field.required) {
        if (val === '' || val === undefined || val === null ||
            (Array.isArray(val) && val.length === 0) ||
            (field.type === 'rating' && val === 0)) {
          newErrors[field.id] = field.validation?.message || `${field.label} is required`;
          continue;
        }
      }

      // Validation rules
      if (field.validation && val !== '' && val !== undefined) {
        if (field.validation.min !== undefined && typeof val === 'number' && val < field.validation.min) {
          newErrors[field.id] = field.validation.message || `Minimum value is ${field.validation.min}`;
        }
        if (field.validation.max !== undefined && typeof val === 'number' && val > field.validation.max) {
          newErrors[field.id] = field.validation.message || `Maximum value is ${field.validation.max}`;
        }
        if (field.validation.pattern && typeof val === 'string') {
          try {
            const re = new RegExp(field.validation.pattern);
            if (!re.test(val)) {
              newErrors[field.id] = field.validation.message || 'Invalid format';
            }
          } catch {
            // Invalid regex pattern, skip
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [visibleFields, values]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Build data from visible fields only
    const data: Record<string, unknown> = {};
    for (const field of visibleFields) {
      data[field.id] = values[field.id];
    }

    setSubmitted(true);
    setSubmittedData(data);
    onSubmit?.(data);
  }, [validate, visibleFields, values, onSubmit]);

  const handleResubmit = useCallback(() => {
    setSubmitted(false);
    setSubmittedData(null);
    setErrors({});
  }, []);

  if (submitted && submittedData) {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3 animate-fade-in-up">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
            <Check size={14} className="text-accent" />
          </div>
          <span className="text-sm font-medium text-text-primary">Response submitted</span>
        </div>
        <div className="space-y-1 pl-8">
          {visibleFields.map((field) => (
            <div key={field.id} className="text-xs">
              <span className="text-text-tertiary">{field.label}: </span>
              <span className="text-text-secondary">
                {Array.isArray(submittedData[field.id])
                  ? (submittedData[field.id] as string[]).join(', ')
                  : field.type === 'checkbox'
                  ? submittedData[field.id] ? 'Yes' : 'No'
                  : field.type === 'rating'
                  ? `${submittedData[field.id]}/${field.validation?.max ?? 5} stars`
                  : String(submittedData[field.id] ?? '')}
              </span>
            </div>
          ))}
        </div>
        {spec.allow_multiple && (
          <button
            type="button"
            onClick={handleResubmit}
            className="ml-8 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-border-default bg-surface-1 text-text-secondary hover:text-text-primary hover:border-border-focus cursor-pointer transition-colors"
          >
            Submit again
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-border-default bg-surface-0 overflow-hidden animate-fade-in-up ${compact ? '' : 'my-3'}`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-surface-1 border-b border-border-default">
        <div className="flex items-center gap-2">
          <ClipboardList size={14} className="text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">{spec.title}</h3>
        </div>
        {spec.description && (
          <p className="text-xs text-text-tertiary mt-1">{spec.description}</p>
        )}
      </div>

      {/* Fields */}
      <div className="p-4 space-y-4">
        {visibleFields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => setValue(field.id, v)}
            error={errors[field.id]}
          />
        ))}
      </div>

      {/* Submit */}
      <div className="px-4 py-3 bg-surface-1 border-t border-border-default">
        <button
          type="submit"
          className="px-4 py-2 bg-accent hover:bg-accent/90 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
        >
          {spec.submit_label || 'Submit'}
        </button>
      </div>
    </form>
  );
}

export { FormRenderer };
