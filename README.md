# Drovalt

Статический кабинет мерчанта Drova. Приложение работает напрямую с
`https://services.drova.io`; отдельного backend или token relay нет.

## Локальная разработка

```bash
npm install
npm run dev
```

## Сборки

- `npm run build` — основная Vinext/Sites-сборка.
- `npm run build:pages` — статическая SPA-сборка в `dist-pages/` для GitHub
  Pages.

GitHub Pages использует hash-маршруты (`#/stations`, `#/games`,
`#/statistics`, `#/sessions`) и публикуется workflow из
`.github/workflows/pages.yml`.

Merchant token хранится только в `localStorage` origin, на котором открыт
кабинет. Его нельзя добавлять в исходники, URL, логи или fixtures.
