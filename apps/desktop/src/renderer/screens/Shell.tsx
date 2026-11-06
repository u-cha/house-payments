import { useState } from 'react';
import { TitleBar } from '../components';
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
  const [section, setSection] = useState<Section>('Главная');

  return (
    <>
      <TitleBar section={section} />
      <div className="app-body">
        <nav className="sidebar" aria-label="Разделы">
          {SECTIONS.map((item) => (
            <button
              key={item}
              type="button"
              className="nav-item"
              aria-current={item === section ? 'page' : undefined}
              onClick={() => setSection(item)}
            >
              {item}
            </button>
          ))}
          <div className="sidebar-foot">
            Данные хранятся
            <br />
            локально на устройстве
          </div>
        </nav>
        <main className="content" id="main">
          {section === 'Объекты' ? (
            <Properties />
          ) : (
            <div className="page-head placeholder">
              <div className="grow">
                <h1>{section}</h1>
                <p>{PLACEHOLDER[section]}</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
