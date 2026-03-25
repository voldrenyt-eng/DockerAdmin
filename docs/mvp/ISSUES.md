# DockerAdmin MVP (P0) — GitHub Issues (Epics → Issues → Acceptance)

> Принцип: маленькі ізольовані задачі з чіткими межами.  
> Кожен Issue має бути реально закритий за 1–2 сесії.  
> Для кожної задачі бажано вказувати priority / dependency / smoke-check у трекері.

---

## EPIC E0 — Repo & Tooling Bootstrap (DevEx)
**Ціль:** репо збирається/запускається локально, є базові скрипти та інфра.

### E0-1 Monorepo scaffold (pnpm/turbo + TS strict)
**Owner:** architect  
**Priority:** P0-blocker  
**AC:**
- `pnpm dev` запускає API + Web
- `pnpm typecheck` проходить без помилок
- `pnpm lint` проходить
- базова структура monorepo задокументована

### E0-2 Docker platform compose (postgres + traefik + volumes)
**Owner:** devops  
**Priority:** P0-blocker  
**AC:**
- `docker compose -f infra/docker-compose.platform.yml up -d` підіймає postgres і traefik
- Traefik dashboard доступний на `:8080` тільки в DEV
- volume для postgres персистить дані
- DEV-only dashboard позначений у docs

### E0-3 Runtime storage layout (data/projects/*)
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- API має утиліти/константи шляхів для `data/projects/{id}`
- path traversal guard не дозволяє виходити за межі `data/`
- створення runtime directory уніфіковане через спільні helpers

### E0-4 Environment/config bootstrap
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- є єдина схема env-конфігів для API
- `ENV_ENCRYPTION_KEY` є mandatory
- API не стартує без критичних env
- README/docs містить мінімальний перелік required env vars

---

## EPIC E1 — Shared DTO + Error Contract
**Ціль:** один контракт для API + Web.

### E1-1 Shared DTO package baseline
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `packages/shared` містить Zod схеми:
  - `ApiError`
  - `Auth`
  - `Project`
  - `Deployment`
  - `Domain`
  - `Service`
  - `Metrics`
- API імпортує DTO з shared
- request/response валідуюються через shared DTO

### E1-2 Standard error contract
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- усі контрольовані помилки API повертаються як `{ error: { code, message } }`
- є мапінг для `401/403/404/409/422/500`
- Web використовує той самий контракт без локальних винятків

---

## EPIC E2 — Database + Auth (JWT) + Seed Admin
**Ціль:** можна залогінитись і мати сесію.

### E2-1 Prisma schema + migrations
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- Prisma моделі мінімум:
  - `User`
  - `Project`
  - `Deployment`
  - `Domain`
  - `AuditLog`
  - `RefreshToken`
- `pnpm db:migrate` створює таблиці

### E2-2 Seed admin user
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `pnpm db:seed` створює admin з `SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD`, якщо його нема
- пароль хешується
- вибір алгоритму хешування задокументовано

### E2-3 Auth endpoints (login/refresh/logout/me)
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `POST /api/auth/login` повертає `accessToken + refreshToken`
- `POST /api/auth/refresh` ротує refresh token
- старий refresh token після rotation стає невалідний
- `POST /api/auth/logout` інвалідовує поточний refresh token
- `GET /api/me` повертає юзера при валідному access token
- невалідні токени → стандартизована помилка `{ error: { code, message } }`

### E2-4 Refresh token persistence
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- refresh token зберігається в БД у hashed вигляді
- є TTL для access і refresh
- revoked/expired refresh token не можна використати повторно

### E2-5 Minimal auth guard
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- захищені ендпоінти недоступні без access token
- WebSocket logs endpoint також вимагає auth
- MVP працює в режимі `ADMIN only`
- розширений RBAC відкладено за межі MVP

### E2-6 Rate limit auth endpoints
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- login endpoint має rate limit
- перевищення ліміту повертає чітку стандартизовану помилку
- ліміт задокументований

---

## EPIC E3 — Projects (Create from ZIP / Public Git)
**Ціль:** можна створити Project і мати робочу директорію.

### E3-1 Projects CRUD (metadata)
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `POST /api/projects` створює project (`name`, `sourceType`)
- `GET /api/projects` повертає список
- `GET /api/projects/:id` повертає деталі
- `PATCH /api/projects/:id` оновлює metadata мінімально (наприклад `name`)
- валідація name є консистентною

### E3-2 Project slug / runtime identity
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- для кожного project генерується стабільний `slug`
- slug унікальний
- slug безпечний для `docker compose -p`
- rename project не змінює slug

### E3-3 ZIP upload + safe extract
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `POST /api/projects/:id/source/zip` приймає `.zip`
- archive розпаковується в `data/projects/{id}/src`
- symlink/path traversal/special files блокуються
- є max upload size і max extracted size
- при підозрілому архіві повертається читабельна помилка

### E3-4 Public Git clone
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `POST /api/projects/:id/source/git` приймає `url`, `branch?`
- клонування виконується тільки для `https://` public repos
- clone йде в `data/projects/{id}/repo`
- timeout і помилки клонування повертаються читабельно
- submodules у MVP не використовуються

### E3-5 Source workspace replace policy
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- повторний ZIP upload або Git clone атомарно замінює попередній source workspace
- якщо новий extract/clone впав — попередній робочий source зберігається
- cleanup тимчасових директорій виконується без виходу за межі project data dir

### E3-6 Env store (encrypt at rest)
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `PUT /api/projects/:id/env` приймає `.env` content
- є мінімальна валідація формату `KEY=VALUE`
- значення шифруються в `env.enc` через AES-256-GCM
- plaintext `.env` не пишеться на диск
- жодного виводу секретів у логи

### E3-7 Env read policy
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `GET /api/projects/:id/env` має чітко визначену policy
- у MVP endpoint доступний тільки ADMIN
- policy задокументована
- відповідь не ламає security model

---

## EPIC E4 — Deploy Engine (docker compose recreate)
**Ціль:** натиснув Deploy → проект запущений.

### E4-1 Compose validation (presence + parse)
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- перед deploy перевіряється наявність compose file в корені source dir
- підтримуються:
  - `docker-compose.yml`
  - `docker-compose.yaml`
  - `compose.yml`
  - `compose.yaml`
- якщо file не знайдено — чітка помилка `compose file not found`
- якщо знайдено більше одного — чітка помилка про неоднозначність

### E4-2 Deploy preflight checks
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- перед стартом deploy перевіряється доступність Docker daemon
- перевіряється наявність working source
- перевіряється готовність env/decrypt path
- помилки повертаються до запуску deploy process

### E4-3 Deploy endpoint (recreate)
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `POST /api/projects/:id/deploy` виконує deploy у project working dir
- використовується `docker compose -p <slug> up -d --build`
- stdout/stderr пишуться в `deploy/last-deploy.log`
- секрети редагуються перед записом логу
- створюється `Deployment` record
- статуси мінімум: `RUNNING | SUCCESS | FAILED`

### E4-4 Deploy locking
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- для одного project не можна запустити 2 deploy одночасно
- другий deploy отримує `409 CONFLICT`
- lock звільняється після success/fail/timeout

### E4-5 Deploy timeout handling
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- deploy має configurable timeout
- timeout позначає deployment як `FAILED`
- лог до моменту timeout зберігається
- завислий process не лишається без контролю

### E4-6 Deployment status endpoint
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `GET /api/projects/:id/deployments?limit=10` повертає останні deploy записи
- відповідь містить мінімум:
  - status
  - startedAt
  - finishedAt
  - trigger/source
- сортування за newest-first

### E4-7 Deploy audit integration
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- старт deploy і результат deploy пишуться в AuditLog
- audit не містить секретів
- failure reason зберігається без небезпечного витоку даних

---

## EPIC E5 — Services Control
**Ціль:** керувати контейнерами (`start/stop/restart`).

### E5-1 List services for a project
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `GET /api/projects/:id/services` повертає список сервісів/контейнерів project
- відповідь містить мінімум:
  - `serviceName`
  - `containerName`
  - `status/state`
  - `image`
  - `ports`
  - `startedAt`

### E5-2 Service identity mapping
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- action endpoint не приймає довільний container id без перевірки
- service/container має бути доведено прив’язаним до project slug
- не можна виконати action над контейнером чужого project

### E5-3 Service action endpoint
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `POST /api/services/:serviceId/action` підтримує `start|stop|restart`
- помилки Docker daemon обробляються коректно
- service actions пишуться в AuditLog
- відповідь стандартизована

---

## EPIC E6 — Logs (WebSocket streaming)
**Ціль:** дивитись live-логи.

### E6-1 Logs HTTP fallback
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `GET /api/projects/:id/logs?serviceName=&tail=` повертає останні N рядків
- є sane default для `tail`
- service прив’язується до project без можливості читати чужі логи

### E6-2 WS logs stream
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `WS /api/ws/logs?projectId=&serviceName=&tail=` стрімить логи
- endpoint спочатку віддає `tail`, потім follow stream
- disconnect/reconnect не валить API

### E6-3 WS auth + stream safety
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- WS endpoint вимагає валідний access token
- unauthorized connection відхиляється
- API не падає на великому потоці логів
- stream cleanup виконується після disconnect

---

## EPIC E7 — Metrics (docker stats)
**Ціль:** показати CPU/RAM/NET базово.

### E7-1 Metrics endpoint
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `GET /api/metrics?projectId=` повертає метрики по контейнерах project
- endpoint не падає, якщо частина контейнерів недоступна
- відповідь валідована shared DTO

### E7-2 Metrics normalization
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- API повертає:
  - CPU %
  - memory usage
  - memory limit
  - network RX
  - network TX
- формат метрик стабільний і задокументований

### E7-3 Web polling for metrics
**Owner:** frontend  
**Priority:** P0-nice  
**AC:**
- фронт оновлює метрики приблизно кожні 5 секунд
- loading/error state присутні
- polling зупиняється при unmount

---

## EPIC E8 — Domains via Traefik (dynamic file) + SSL baseline
**Ціль:** домен → сервіс.

### E8-1 Domains CRUD
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- `POST /api/domains` створює domain binding
- `GET /api/domains` повертає список
- `DELETE /api/domains/:id` видаляє binding

### E8-2 Domain validation & collision checks
**Owner:** backend  
**Priority:** P0-blocker  
**AC:**
- `host` має бути валідним FQDN
- `port` має бути валідним integer `1..65535`
- не можна створити duplicate host
- не можна створити binding для неіснуючого service

### E8-3 Generate Traefik routes.yml from DB
**Owner:** devops + backend  
**Priority:** P0-blocker  
**AC:**
- при зміні Domain API перегенеровує `infra/traefik/dynamic/routes.yml`
- генерація виконується через temp file + atomic rename
- routes file генерується з повного DB snapshot
- Traefik підхоплює зміни без рестарту (`watch=true`)

### E8-4 SSL resolver wiring (Traefik)
**Owner:** devops  
**Priority:** P0-nice  
**AC:**
- в Traefik увімкнений ACME http-01
- DEV mode може працювати через staging toggle
- для `tlsEnabled=true` додається TLS resolver у router

---

## EPIC E9 — Telegram Notifications
**Ціль:** мінімальні алерти.

### E9-1 Telegram notifier service
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- telegram notification винесений в окремий notifier service
- токен/чат читаються з env
- failure notifier-а не ламає основний deploy flow

### E9-2 Deploy success/fail notifications
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- після deploy `SUCCESS/FAILED` надсилається повідомлення в Telegram, якщо налаштовано
- якщо Telegram не налаштований — deploy не падає
- warning лог не містить токена

---

## EPIC E10 — Web UI (MVP screens)
**Ціль:** мінімальний UI для основних флоу.

### E10-1 Login page + token handling
**Owner:** frontend  
**Priority:** P0-blocker  
**AC:**
- login працює
- access/refresh handling реалізований згідно прийнятого рішення
- logout чистить сесію

### E10-2 Protected routes + session restore
**Owner:** frontend  
**Priority:** P0-core  
**AC:**
- protected pages редіректять на login без валідної сесії
- session restore після reload працює
- refresh flow прозорий для користувача

### E10-3 Projects list + create project (zip/git)
**Owner:** frontend  
**Priority:** P0-blocker  
**AC:**
- список project-ів відображається
- є кнопка Create Project
- створення з ZIP і Git URL працює через UI
- є базові loading/error states

### E10-4 Project detail shell
**Owner:** frontend  
**Priority:** P0-blocker  
**AC:**
- є сторінка деталей project
- є вкладки:
  - Services
  - Logs
  - Domains
  - Deployments
  - Env
- header показує основну інформацію про project

### E10-5 Project env editor
**Owner:** frontend  
**Priority:** P0-core  
**AC:**
- env editor завантажує поточний env згідно backend policy
- save викликає `PUT /env`
- є success/error state
- UI не виводить секрети в console logs

### E10-6 Deploy panel + status
**Owner:** frontend  
**Priority:** P0-core  
**AC:**
- можна натиснути Deploy
- відображається поточний deploy status
- видно останні deploy записи або мінімум останній результат
- під час активного deploy UI блокує повторний запуск

### E10-7 Services + Logs + Domains tabs
**Owner:** frontend  
**Priority:** P0-core  
**AC:**
- Services tab показує список сервісів і service actions
- Logs tab стрімить логи по WS
- Domains tab дозволяє створити і видалити domain binding
- є empty/error/loading states

---

## EPIC E11 — Hardening, Audit, Limits
**Ціль:** мінімальна production hygiene.

### E11-1 AuditLog for sensitive actions
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- AuditLog пишеться для:
  - login success/fail
  - logout
  - project create/update
  - source upload/clone
  - env update
  - deploy
  - service action
  - domain change
- audit запис не містить секретів

### E11-2 Audit API
**Owner:** backend  
**Priority:** P0-nice  
**AC:**
- `GET /api/audit?limit=100` доступний тільки ADMIN
- newest-first
- є мінімальна пагінація або limit control

### E11-3 Security headers + CORS baseline
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- API має базові security headers
- CORS дозволяє тільки налаштований Web origin
- policy задокументована

### E11-4 Input and upload limits
**Owner:** backend  
**Priority:** P0-core  
**AC:**
- є body size limits
- є upload size limits
- перевищення лімітів повертає стандартизовану помилку

---

## EPIC E12 — CI + Release Basics
**Ціль:** автоматичні перевірки.

### E12-1 GitHub Actions: lint/typecheck/test
**Owner:** devops  
**Priority:** P0-blocker  
**AC:**
- PR запускає pipeline
- pipeline падає при lint/typecheck/test fail

### E12-2 Build validation
**Owner:** devops  
**Priority:** P0-core  
**AC:**
- CI перевіряє build для API і Web
- збірка не покладається тільки на typecheck

### E12-3 Infra / compose smoke
**Owner:** devops  
**Priority:** P0-core  
**AC:**
- є мінімальний smoke-check для platform compose
- Prisma schema/validate/migrate перевіряються в CI
- базові failing scenarios видно в CI output
