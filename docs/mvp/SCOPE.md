# DockerAdmin MVP (P0) — Scope

## 1) Ціль
Self-hosted адмін-панель для керування `docker compose` проєктами на **одному сервері**.

MVP має покривати:
- створення/керування `Project`
- завантаження source з ZIP або public Git URL
- збереження `.env` у зашифрованому вигляді
- деплой через `docker compose up -d --build` (recreate)
- перегляд сервісів
- керування сервісами (`start/stop/restart`)
- логи (HTTP tail + WebSocket stream)
- базові метрики контейнерів
- домени через Traefik dynamic file provider
- мінімальні Telegram нотифікації про deploy

---

## 2) Джерела правди (агент завжди читає в такому порядку)
1. `.agent/rules/*`
2. `docs/STATUS.md`
3. `docs/mvp/SCOPE.md`
4. `docs/mvp/ISSUES.md`
5. `design-system/MASTER.md` + `design-system/pages/*`

> Принцип: design-before-code → plan → small isolated execution.

---

## 3) Технічні припущення MVP
- Платформа: **Linux only**
- Один сервер, один локальний Docker daemon
- Підтримується **Docker Compose V2**
- Підключення до Docker: через `/var/run/docker.sock`
- Reverse proxy: **Traefik**
- Routing: тільки через **Traefik file provider**
- Git source у MVP: тільки **public HTTPS repositories**
- SSH-ключі, private repos, git credentials — **не входять в MVP**
- Compose file шукається тільки в **корені source directory**
- Підтримувані назви compose файлів:
  - `docker-compose.yml`
  - `docker-compose.yaml`
  - `compose.yml`
  - `compose.yaml`

---

## 4) Non-goals (НЕ робимо в MVP)
- Multi-server / SSH агенти / Swarm / Kubernetes
- Blue-green / canary / rolling deploy / auto rollback
- GitHub App / webhooks / private repos
- Глибокий менеджмент volumes / networks
- DB browser / backup scheduler
- Повнотекстовий пошук логів з індексацією (Loki / ELK / ClickHouse)
- Secrets manager / key rotation UI
- Queue system для deploy jobs
- Проєктні шаблони / marketplace / one-click stacks

---

## 5) MVP User Stories
- Як Admin, я можу залогінитись і бачити список проєктів.
- Як Admin, я можу створити Project із ZIP або public Git URL.
- Як Admin, я можу зберегти/оновити `.env`, і він зберігається **зашифрованим**.
- Як Admin, я можу натиснути Deploy, і система виконає recreate deploy через `docker compose`.
- Як Admin, я можу бачити поточний статус останнього deploy.
- Як Admin, я можу дивитись список сервісів і робити `start/stop/restart`.
- Як Admin, я можу дивитись live-логи сервісу через WebSocket.
- Як Admin, я можу бачити базові метрики контейнерів.
- Як Admin, я можу прив’язати домен до сервісу, і Traefik починає маршрутизувати трафік.
- Як Admin, я отримую Telegram повідомлення про успіх або помилку deploy.

---

## 6) Архітектурні межі (MVP)

### Компоненти
- Web (React SPA)
- API (Fastify)
- DB (PostgreSQL + Prisma)
- Traefik (reverse proxy, dynamic routes з файлу)
- Docker daemon
- Telegram notifier

### Runtime storage layout
- `data/projects/{projectId}/`
  - `src/` — source після ZIP extract
  - `repo/` — source після Git clone
  - `env.enc` — encrypted `.env` (AES-256-GCM)
  - `deploy/last-deploy.log` — stdout/stderr без секретів

### Runtime identity
- Кожен project має стабільний `slug`
- Саме `slug` використовується як `docker compose -p <slug>`
- Зміна display name проєкту не повинна ламати runtime identity

---

## 7) Security boundaries (мінімум)
- Ніяких секретів у логах, audit, deploy output і помилках
- Plaintext `.env` **не зберігається на диск**
- `ENV_ENCRYPTION_KEY` є обов’язковим для старту API
- Без shell injection:
  - не конкатенувати user input у shell string
  - використовувати `spawn/execFile` з аргументами
- Path traversal guard для всіх операцій з файлами
- ZIP extraction має блокувати:
  - path traversal
  - symlink entries
  - special files
- Git clone дозволений тільки для `https://...`
- WebSocket logs endpoint вимагає auth
- Захищені API endpoints недоступні без access token
- CORS дозволений тільки для налаштованого Web origin

---

## 8) Reliability boundaries
- Для одного project дозволений тільки **один активний deploy одночасно**
- Другий deploy під час активного — повертає `409 CONFLICT`
- Deploy має timeout
- Deploy завжди пише status у БД: `RUNNING | SUCCESS | FAILED`
- Lock звільняється і після fail/timeout
- Усі помилки API повертаються у форматі:
  - `{ error: { code, message } }`
- Перегенерація Traefik config виконується **атомарно**
- Якщо Telegram не налаштований або send fail — deploy **не падає**

---

## 9) Source ingestion rules
### ZIP
- Підтримується тільки `.zip`
- Є максимальний розмір upload
- Є максимальний сумарний розмір після розпакування
- При повторному upload source оновлюється **атомарно**
- Якщо новий extract fail — старий робочий source не губиться

### Git
- Тільки `https://` public repositories
- `branch` — optional
- Є timeout на clone
- Submodules у MVP не підтримуються
- При повторному clone source оновлюється **атомарно**
- Якщо clone fail — попередній робочий source не губиться

---

## 10) Deploy semantics
- Compose file шукається тільки в корені `src/` або `repo/`
- Якщо compose file не знайдено — повертається чітка помилка
- Якщо знайдено більше одного підтримуваного compose file — повертається чітка помилка
- Deploy запускається в project working directory
- MVP команда deploy:
  - `docker compose -p <slug> up -d --build`
- Успішний deploy = process exit code `0` + запис у `Deployment`
- stdout/stderr пишуться у `deploy/last-deploy.log` після редагування секретів
- Історія deploy зберігається у БД
- Скасування deploy через UI в MVP не входить, але timeout — обов’язковий

---

## 11) Service model
- Сервіси визначаються в межах одного Project runtime
- Не можна виконати action над контейнером, який не належить project slug
- Підтримувані actions:
  - `start`
  - `stop`
  - `restart`

---

## 12) Logs model
- HTTP endpoint повертає останні `N` рядків
- WebSocket endpoint віддає:
  - `tail` історію
  - далі follow stream
- Disconnect/reconnect не повинні валити API
- Access до логів лише для авторизованого користувача

---

## 13) Metrics model
- Показуються базові runtime метрики по контейнерах:
  - CPU %
  - memory usage
  - memory limit
  - network RX/TX
- Формат відповіді нормалізований і спільний для API/Web

---

## 14) Domains model
- Domain прив’язується до:
  - `projectId`
  - `serviceName`
  - `host`
  - `port`
  - `tlsEnabled`
- `host` має бути валідним FQDN
- Один і той самий `host` не може бути створений двічі
- Traefik routes генеруються з повного snapshot БД
- Traefik підхоплює зміни без рестарту

---

## 15) Notifications model
- Після deploy надсилається Telegram повідомлення:
  - `SUCCESS`, якщо deploy успішний
  - `FAILED`, якщо deploy впав
- Якщо Telegram не налаштований — лише WARN у логах
- Нотифікації не впливають на deploy result

---

## 16) UX minimum
- Зрозумілий progress deploy:
  - поточний статус
  - час старту/завершення
  - останні рядки логів
- Protected routes у Web
- Session restore після reload
- Мінімальні empty/error states для:
  - project list
  - services
  - logs
  - domains
  - deployments

---

## 17) Що свідомо не входить в MVP
- Delete project з видаленням runtime/data
- Rollback deploy
- Multi-user collaboration flows
- Fine-grained permissions beyond minimal auth
- Search/filter/sort advanced UX
- Historical metrics storage
- Structured logs
- Project templates
- Background job orchestration

> Якщо delete project знадобиться рано — винести в окремий P1/P0.5 issue після стабілізації базового deploy path.

---

## 18) Definition of Done (для MVP задач)
Задача вважається завершеною, якщо:
- є acceptance criteria в `docs/mvp/ISSUES.md`
- реалізація пройшла:
  - `lint`
  - `typecheck`
  - `test`
- якщо тестів ще нема — додано мінімальні smoke checks
- оновлено `docs/STATUS.md`:
  - що зроблено
  - що далі
  - які ризики лишились
- не розширено scope поза межі MVP без явного рішення
