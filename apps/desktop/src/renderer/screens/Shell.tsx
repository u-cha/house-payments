import { useState } from 'react';
import { TitleBar } from '../components';
import { Icon, type IconName } from '../icons';
import { Properties } from './Properties';
import { Types } from './Types';

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

/** Справочники живут в сворачиваемой группе: со временем их станет несколько. */
const DIRECTORIES: SectionItem[] = [{ label: 'Типы объекта', icon: 'book' }];

const PLACEHOLDER: Record<string, string> = {
  Главная: 'Каркас навигации готов: сводка появится в следующих задачах.',
  Поставщики: 'Раздел «Поставщики» появится вместе со справочниками (M1).',
  Квитанции: 'Раздел «Квитанции» появится вместе с квитанциями (M2).',
  Платежи: 'Раздел «Платежи» появится вместе с платежами (M2).',
};

/**
 * Каркас навигации после входа: разделы из screens.md §1. Группа «Справочники»
 * свёрнута по умолчанию, состояние держится на время работы приложения; выбор
 * пункта внутри раскрывает группу и подсвечивает его.
 */
export function Shell() {
  const [section, setSection] = useState<Section>('Главная');
  const [directoriesOpen, setDirectoriesOpen] = useState(false);

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

          {/* Справочники стоят отдельной группой под разделами: их станет больше. */}
          <button
            type="button"
            className="nav-item nav-group nav-group-separated"
            aria-expanded={directoriesOpen}
            aria-controls="nav-directories"
            onClick={() => setDirectoriesOpen((open) => !open)}
          >
            <Icon name="book" />
            <span>Справочники</span>
            <Icon name="chevron" className="nav-chevron" />
          </button>
          {directoriesOpen ? (
            <div id="nav-directories" className="nav-group-list">
              {DIRECTORIES.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="nav-item nav-child"
                  aria-current={item.label === section ? 'page' : undefined}
                  onClick={() => setSection(item.label)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="sidebar-foot">
            Данные хранятся
            <br />
            локально на устройстве
          </div>
        </nav>
        <main className="content" id="main">
          {section === 'Объекты' ? (
            <Properties />
          ) : section === 'Типы объекта' ? (
            <Types />
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
