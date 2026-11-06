import { useState } from 'react';
import { useSession } from '../session';
import { Properties } from './Properties';

const SECTIONS = ['Главная', 'Объекты', 'Поставщики', 'Квитанции', 'Платежи'] as const;
type Section = (typeof SECTIONS)[number];

const PLACEHOLDER: Partial<Record<Section, string>> = {
  Главная: 'Каркас навигации готов: сводка появится в следующих задачах.',
  Поставщики: 'Раздел «Поставщики» появится вместе со справочниками (M1).',
  Квитанции: 'Раздел «Квитанции» появится вместе с квитанциями (M2).',
  Платежи: 'Раздел «Платежи» появится вместе с платежами (M2).',
};

/** Каркас навигации после входа: разделы-заглушки из screens.md §1. */
export function Shell() {
  const { profile, quit } = useSession();
  const [section, setSection] = useState<Section>('Главная');

  return (
    <div className="shell">
      <header className="topbar">
        <strong>house-payments</strong>
        <span className="muted">{profile?.name}</span>
        <button type="button" className="ghost" onClick={quit}>
          Выйти
        </button>
      </header>
      <div className="body">
        <nav aria-label="Разделы">
          {SECTIONS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === section ? 'nav-item active' : 'nav-item'}
              aria-current={item === section ? 'page' : undefined}
              onClick={() => setSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <main className="content">
          {section === 'Объекты' ? (
            <Properties />
          ) : (
            <>
              <h1>{section}</h1>
              <p className="muted">{PLACEHOLDER[section]}</p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
