# DockerAdmin — Architecture (MVP)

## 1) Goal
MVP — self-hosted admin panel для керування `docker compose` проєктами на одному сервері.

Система дозволяє:
- створювати project
- завантажувати source з ZIP або public Git
- зберігати `.env` у зашифрованому вигляді
- виконувати deploy
- дивитись сервіси, логи, метрики
- прив’язувати домени через Traefik
- отримувати Telegram нотифікації про deploy

---

## 2) Main components

### Web
React SPA для:
- login
- project list
- project details
- env editor
- deploy status
- services
- logs
- domains

### API
Fastify API для:
- auth
- projects CRUD
- source ingestion
- env encryption/decryption
- deploy orchestration
- docker service actions
- logs
- metrics
- domains
- audit log
- telegram notifications

### DB
PostgreSQL + Prisma:
- `User`
- `RefreshToken`
- `Project`
- `Deployment`
- `Domain`
- `AuditLog`

### Runtime integrations
- Docker daemon via `/var/run/docker.sock`
- Traefik via dynamic file provider
- Telegram Bot API

---

## 3) Runtime data layout

### Filesystem layout

    data/
      projects/
        {projectId}/
          src/
          repo/
          env.enc
          deploy/
            last-deploy.log

### Notes
- `src/` використовується після ZIP upload
- `repo/` використовується після Git clone
- одночасно активним вважається один working source
- plaintext `.env` не зберігається на диск

---

## 4) Project model

### Project identity
Project має:
- `id`
- `name`
- `slug`
- `sourceType`

### Important rule
`slug` є стабільним runtime identifier і використовується в:
- `docker compose -p <slug>`
- прив’язці контейнерів до project runtime

Rename project не змінює `slug`.

---

## 5) Auth flow

### Login
1. Web надсилає `POST /api/auth/login`
2. API перевіряє email/password
3. API повертає:
   - `accessToken`
   - `refreshToken`
4. API пише audit event

### Refresh
1. Web надсилає `POST /api/auth/refresh`
2. API перевіряє refresh token
3. API ротує refresh token
4. Старий refresh token стає невалідним

### Logout
1. Web надсилає `POST /api/auth/logout`
2. API revoke-ить поточний refresh token
3. Web очищає локальну сесію

### MVP policy
- тільки `ADMIN`
- усі захищені endpoints вимагають access token
- WS logs також вимагає auth

---

## 6) Source ingestion flow

### ZIP upload
1. Створюється project metadata
2. ZIP upload приходить у `POST /api/projects/:id/source/zip`
3. API валідує:
   - file type
   - upload size
   - extracted size
   - відсутність traversal
   - відсутність symlink
   - відсутність special files
4. Архів розпаковується у тимчасову директорію
5. Після успіху workspace атомарно замінюється
6. API пише audit event

### Git clone
1. Web/API викликає `POST /api/projects/:id/source/git`
2. API перевіряє `https://` URL
3. Clone виконується у тимчасову директорію
4. Після успіху workspace атомарно замінюється
5. Timeout/error повертається читабельно
6. API пише audit event

### Rule
Якщо новий source ingestion падає, попередній робочий source не втрачається.

---

## 7) Env storage flow

### Save env
1. Web надсилає `.env` content
2. API виконує мінімальну валідацію `KEY=VALUE`
3. API шифрує content через AES-256-GCM
4. Результат пишеться у `env.enc`

### Read env
- у MVP тільки `ADMIN`
- endpoint policy має бути єдиною і задокументованою

### Security rules
- plaintext `.env` не зберігається на диск
- значення не потрапляють у logs
- значення не потрапляють у audit
- значення не потрапляють у errors
- `ENV_ENCRYPTION_KEY` обов’язковий для старту API

---

## 8) Deploy flow

### Preflight
Перед deploy API перевіряє:
- чи існує working source
- чи доступний Docker daemon
- чи існує рівно один compose file в корені
- чи готовий env decrypt path

### Deploy start
1. Web надсилає `POST /api/projects/:id/deploy`
2. API перевіряє deploy lock
3. Якщо lock уже є — повертає `409 CONFLICT`
4. Створюється `Deployment` зі статусом `RUNNING`

### Deploy execution
Команда MVP:

`docker compose -p <slug> up -d --build`

### Deploy result
- `exit code 0` → `SUCCESS`
- timeout → `FAILED`
- non-zero exit code → `FAILED`
- runtime failure → `FAILED`

### Logging
- stdout/stderr записуються в `deploy/last-deploy.log`
- перед записом застосовується redaction secrets
- після завершення lock звільняється завжди

### Notifications
- після result API намагається надіслати Telegram notification
- помилка notifier-а не валить deploy result

---

## 9) Services flow

### Services listing
API визначає сервіси проєкту через `project slug` і runtime mapping.

### Allowed actions
- `start`
- `stop`
- `restart`

### Safety rule
Не можна виконати action над контейнером, який не належить project runtime.

---

## 10) Logs flow

### HTTP logs
`GET /api/projects/:id/logs?serviceName=&tail=`

Повертає останні N рядків.

### WS logs
`WS /api/ws/logs?projectId=&serviceName=&tail=`

Поведінка:
1. спочатку `tail`
2. потім follow stream

### Safety rules
- endpoint вимагає auth
- stream cleanup виконується після disconnect
- користувач не може читати логи чужого project

---

## 11) Metrics flow

API отримує runtime stats для контейнерів project і повертає нормалізований DTO:
- CPU %
- memory usage
- memory limit
- network RX
- network TX

Frontend у MVP використовує polling приблизно кожні 5 секунд.

---

## 12) Domains / Traefik flow

### Domain binding
Domain містить:
- `projectId`
- `serviceName`
- `host`
- `port`
- `tlsEnabled`

### Update flow
1. API створює або видаляє binding у DB
2. API генерує повний snapshot `routes.yml`
3. Генерація йде через temp file
4. Потім виконується atomic rename
5. Traefik підхоплює зміну через `watch=true`

### Validation rules
- `host` має бути валідним FQDN
- duplicate host заборонений
- binding до неіснуючого service заборонений

---

## 13) Error contract

Усі контрольовані помилки API повертаються в одному форматі.

### Response shape

    {
      "error": {
        "code": "SOME_CODE",
        "message": "Human-readable message"
      }
    }

### Typical statuses
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` conflict
- `422` validation error
- `500` internal error

---

## 14) Audit model

Audit пишеться для:
- login success
- login fail
- logout
- project create
- project update
- source upload
- source clone
- env update
- deploy start
- deploy result
- service action
- domain create
- domain delete

### Rule
Audit не повинен містити секретів.

---

## 15) Out of scope for MVP
- multi-server
- private Git repos
- SSH auth
- rollback
- delete project with full cleanup
- advanced RBAC
- log indexing/search
- historical metrics storage
- background jobs/queues
