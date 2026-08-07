import React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './Command';
import { cn } from './utils';

export interface ComboOption {
  value: string;
  label: string;
}

export interface ComboSelectProps {
  options: ComboOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * A searchable single-select dropdown that replaces native <select> for lists
 * long enough to need filtering (members, projects, requirements). Built on
 * Popover + Command so it stays consistent with the rest of the kit and gets
 * keyboard navigation for free.
 */
export const ComboSelect = React.forwardRef<HTMLButtonElement, ComboSelectProps>(
  (
    {
      options,
      value,
      onChange,
      placeholder,
      searchPlaceholder,
      disabled = false,
      invalid = false,
      className,
      ariaLabel,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t('common.pleaseSelect');
    const resolvedSearchPlaceholder = searchPlaceholder ?? t('common.searchPlaceholder');
    const resolvedAriaLabel = ariaLabel ?? t('common.select');
    const [open, setOpen] = React.useState(false);
    const selected = options.find((opt) => opt.value === value);

    const [query, setQuery] = React.useState('');
    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter((opt) => opt.label.toLowerCase().includes(q));
    }, [options, query]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={ref}
          disabled={disabled}
          aria-label={resolvedAriaLabel}
          className={cn(
            'ui-combo-select form-select ui-select inline-flex w-full items-center justify-between gap-2 text-left font-normal',
            !selected && 'text-[var(--muted-foreground)]',
            invalid && 'border-[var(--destructive)]',
            className,
          )}
          data-state={invalid ? 'invalid' : 'default'}
        >
          <span className={cn('truncate', !selected && 'text-[var(--muted-foreground)]')}>
            {selected ? selected.label : resolvedPlaceholder}
          </span>
          <ChevronDown size={15} className="shrink-0 opacity-60" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="min-w-[14rem] p-0">
          <Command onSelect={(val: string) => { onChange(val); setOpen(false); }}>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              <Search size={14} className="shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
              <CommandInput
                placeholder={resolvedSearchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 flex-1 border-0 bg-transparent px-0 outline-none placeholder:text-[var(--muted-foreground)]"
              />
            </div>
            <CommandList className="max-h-60 overflow-auto p-1">
              {filtered.length === 0 ? (
                <CommandEmpty className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                  {t('common.noMatch')}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-[var(--accent)]"
                    >
                      <span className="truncate">{opt.label}</span>
                      {opt.value === value ? (
                        <Check size={14} className="shrink-0 text-[var(--primary)]" aria-hidden="true" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);
ComboSelect.displayName = 'ComboSelect';
