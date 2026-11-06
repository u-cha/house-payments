import { useState } from 'react';
import { TitleBar } from '../components';
import { Icon, type IconName } from '../icons';
import { Properties } from './Properties';

interface SectionItem {
  label: string;
  icon: IconName;
}

const SECTIONS: SectionItem[] = [
  { label: 'Главная', icon: 'home' },
  { label: 'Объекты', icon: 'ledger' },
  { label: 'Поставщики', icon: 'tap' },
  { label: 'Квитанции', icon: 'receipt' },
  { label: 'Платежи', icon: 'card' },
];
type Section = string;

const PLACEHOLDER: Record<string, string> = {
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
              key={item.label}
              type="button"
              className="nav-item"
              aria-current={item.label === section ? 'page' : undefined}
              onClick={() => setSection(item.label)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
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
