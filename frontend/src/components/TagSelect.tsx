import { useEffect, useRef, useState } from 'react';

export interface TagOption {
  value: string;
  label: string;
  avatar?: string;
}

interface Props {
  options: TagOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  showAvatars?: boolean;
}

// React port of site.js's enhanceTagSelect — a chip box + filterable dropdown panel standing in
// for a plain <select multiple>. Used for Workflow "who acts" / "Escalate to" and PeoplePicker.
export function TagSelect({ options, selected, onChange, disabled, showAvatars }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q));

  function toggle(value: string) {
    setQuery('');
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) toggle(filtered[activeIndex].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Backspace' && !query && selected.length) {
      onChange(selected.slice(0, -1));
    }
  }

  return (
    <div ref={wrapperRef} className={`tagselect ${showAvatars ? 'avatars' : ''} ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}>
      <div
        className="ts-box"
        onClick={() => {
          if (disabled) return;
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {selected.map((v) => {
          const o = options.find((x) => x.value === v);
          return (
            <span className="ts-chip" key={v}>
              {showAvatars && o?.avatar && <span className="av av-sm">{o.avatar}</span>}
              <span>{o?.label ?? v}</span>
              <button
                type="button"
                className="x"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((s) => s !== v));
                }}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          className="ts-input"
          autoComplete="off"
          placeholder={options.length ? '' : 'No options'}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setActiveIndex(-1);
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <div className="ts-panel">
          {filtered.length === 0 ? (
            <div className="ts-opt empty">No matches</div>
          ) : (
            filtered.map((o, i) => (
              <div
                key={o.value}
                className={`ts-opt ${selected.includes(o.value) ? 'sel' : ''} ${i === activeIndex ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setActiveIndex(i);
                  toggle(o.value);
                }}
              >
                {showAvatars && o.avatar && <span className="av av-sm">{o.avatar}</span>}
                <span>{o.label}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
