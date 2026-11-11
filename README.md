# KlavoTools

> Автор KlavoTools — [Fenex](https://github.com/Fenex).

Браузерное расширение для сайта [klavogonki.ru](https://klavogonki.ru) на **Manifest V3**.

Это порт [klavotools-kango](https://github.com/Fenex/klavotools-kango) (Manifest V2, Kango
framework) без Kango: background работает как service worker (Chrome) / event page (Firefox),
все API — нативные `chrome.*`.

## Возможности

- кнопка на панели с индикацией авторизации и счётчиком непрочитанных сообщений;
- popup: меню сайта, поиск игрока, последние сообщения, свои быстрые ссылки;
- уведомления о соревнованиях (с опциональным звуком) и приглашениях в заезд;
- WebSocket-соединение с сайтом (или опрос по HTTP, если WebSocket отключён в настройках);
- контекстное меню для ссылок на профили и словари;
- стили (скины) для сайта;
- пользовательские скрипты из [KgScripts](https://github.com/voidmain02/KgScripts).

## Пользовательские скрипты и Manifest V3

MV3 запрещает выполнять загруженный из сети код через `eval`, как это делал оригинал.
Поэтому скрипты работают в одном из двух режимов (см. `src/background/userjs.js`):

| Режим | Когда | Откуда скрипты | Обновления |
| --- | --- | --- | --- |
| `remote` | доступен API `userScripts` | репозиторий KgScripts | автоматически, раз в 15 минут |
| `bundled` | API `userScripts` недоступен | снимок KgScripts, вшитый при сборке (`vendor/KgScripts`) | только с новой версией расширения |

Как включить режим `remote`:

- **Chrome 138+**: `chrome://extensions` → «Сведения» у KlavoTools → включить
  «Разрешить пользовательские скрипты» (Allow User Scripts);
- **Chrome 120–137**: включить «Режим разработчика» на `chrome://extensions`;
- **Firefox 136+**: кнопка «Разрешить» в настройках расширения (опциональное разрешение `userScripts`).

Текущий режим и подсказка показываются в настройках расширения, в разделе «Скрипты».

## Сборка

Нужен Node.js 18+.

```bash
npm install
npm run build          # dist/chrome и dist/firefox
npm run build:chrome   # только Chrome
npm run build:firefox  # только Firefox
node scripts/build.mjs --zip   # плюс архивы dist/klavotools-<target>-<version>.zip
npm test               # юнит-тесты (node:test)
```

Обновить встроенный снимок KgScripts:

```bash
npm run sync-userscripts
```

## Установка для отладки

**Chrome**: `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное
расширение» → папка `dist/chrome`.

**Firefox**: `about:debugging` → «Этот Firefox» → «Загрузить временное дополнение…» →
файл `dist/firefox/manifest.json`.

Состояние background доступно из консоли service worker как `KlavoTools`
(например, `KlavoTools.Auth.getState()`).

## Структура

```
src/
  manifest.json        базовый манифест (доводится под браузер в scripts/build.mjs)
  background/          service worker: index.js — точка входа и RPC для popup/options
  content/             content scripts: протокол, скины, отслеживание логина
  popup/, options/     страницы расширения (AngularJS 1.6 в режиме ng-csp)
  offscreen/           воспроизведение звука (в service worker нет Audio)
  shared/userscript.js разбор метаданных и обёртка userscript'ов (общий для сборки и background)
  lib/                 angular.min.js и background.js — RPC-клиент вместо kango.invokeAsync
  res/, icons/         стили (SCSS), картинки, звук
vendor/KgScripts/      снимок пользовательских скриптов для режима bundled
scripts/               сборка и обновление снимка
tests/                 юнит-тесты
```

## Отличия от kango-версии

- `kango.storage` → `chrome.storage.local`; данные старой версии не переносятся
  (у нового расширения другое хранилище);
- протокол по умолчанию — «тот же, что в последний раз», а не принудительный HTTP:
  сайт работает по HTTPS;
- WebSocket подключается по `wss://`; пока соединение активно, service worker
  поддерживается живым, а будильник `chrome.alarms` раз в минуту восстанавливает
  соединение, если браузер всё же выгрузил worker;
- опрос (режим без WebSocket) и обновление скриптов — через `chrome.alarms`;
- в режиме `bundled` скрипты выполняются в контексте страницы (`world: MAIN`), т.к. CSP
  изолированного мира MV3 запрещает вставку inline-`<script>`, которой пользуется большинство
  скриптов KgScripts; в режиме `remote` — в изолированном мире `USER_SCRIPT`, как раньше;
- галерея «Рисовалки» на странице настроек удалена (сервис r.zzzae.biz не отвечает).

## Лицензия

MIT. Оригинальные авторы KlavoTools — Vitaliy Busko, Daniil Filippov.
Пользовательские скрипты — сообщество Клавогонок, репозиторий
[voidmain02/KgScripts](https://github.com/voidmain02/KgScripts) (MIT).
