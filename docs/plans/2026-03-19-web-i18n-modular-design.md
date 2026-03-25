# Web i18n — Modular Locale Catalogs

## Goal
- додати multi-language support for Web with 3 locales:
  - `en`
  - `uk`
  - `ru`
- зберігати переклади не в одному файлі, а по модулях у каталогах:
  - `apps/web/src/lang/en/*`
  - `apps/web/src/lang/uk/*`
  - `apps/web/src/lang/ru/*`
- дати користувачу перемикач мови в settings

## Chosen approach
- lightweight custom i18n layer without external library
- locale bundles are composed from per-module translation files
- selected locale is stored in `localStorage`
- runtime fallback is `en`
- `document.documentElement.lang` follows the selected locale

## File layout
- `apps/web/src/lang/en/common.ts`
- `apps/web/src/lang/en/app.ts`
- `apps/web/src/lang/en/settings.ts`
- same layout for `uk` and `ru`
- `apps/web/src/i18n.ts` for locale registry, resolver, and lookup helpers
- `apps/web/src/i18n-provider.tsx` for React state and context

## In scope
- 3 locales: `en`, `uk`, `ru`
- modular translation catalogs
- settings section with language switcher
- persistent selected locale in browser storage

## Out of scope
- backend locale persistence
- browser locale auto-detection
- plural rules / interpolation framework
- translation extraction tooling

## Verification
- failing tests first for locale resolving and modular key lookup
- `pnpm --filter @dockeradmin/web test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docker:platform:up`
