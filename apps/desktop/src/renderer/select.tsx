import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id: string;
  name?: string;
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string | undefined;
  ariaLabel?: string;
  /** Что показать, пока значение не выбрано (в списке нет подходящего пункта). */
  placeholder?: string;
}

/**
 * Выпадающий список вместо нативного <select>: нативный popup в Electron
 * открывается поверх контрола и позиционируется платформой, из-за чего список
 * уезжает влево-вверх (замечание ревью). Здесь меню всегда раскрывается вниз,
 * стрелка имеет отступ, а клавиатура работает по паттерну listbox:
 * ↑/↓, Home/End, Enter/Space, Esc, Tab, клик вне меню.
 */
export function Select({
  id,
  name,
  value,
  options,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
  ariaLabel,
  placeholder,
}: SelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex];

  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  const openMenu = (): void => {
    if (disabled) return;
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    setOpen(true);
  };

  const choose = (index: number): void => {
    const option = options[index];
    if (option === undefined) return;
    onChange(option.value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      // Esc закрывает только меню, а не лист формы: событие не должно дойти
      // до document-обработчика экрана.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  let menu: ReactNode = null;
  if (open) {
    menu = (
      <ul
        ref={menuRef}
        id={listId}
        className="select-menu"
        role="listbox"
        tabIndex={-1}
        aria-activedescendant={`${listId}-${activeIndex}`}
        aria-label={ariaLabel}
        onKeyDown={onMenuKeyDown}
      >
        {options.map((option, index) => (
          <li
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={option.value === value}
            className={index === activeIndex ? 'select-option active' : 'select-option'}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(index)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="select" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => {
          if (open) close(false);
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select-value">{selected?.label ?? placeholder ?? ''}</span>
        <svg className="select-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {name === undefined ? null : <input type="hidden" name={name} value={value} readOnly />}
      {menu}
    </div>
  );
}
