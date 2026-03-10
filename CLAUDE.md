 ## Project Overview

   **ChatFast** is a multi-tenant WhatsApp management platform by Kelvis Tech. It manages multiple WhatsApp
   instances, bulk messaging campaigns, and infrastructure monitoring. The core WhatsApp connection layer is provided
    by **Evolution API v2** (self-hosted via Docker).

   ## Monorepo Structure

   ```
   chatsfast-core/
   ├── chatfast-backend/   # Express.js 5 + TypeScript + Prisma API (port 3001)
   ├── chatfast-frontend/  # Next.js 16 + React 19 dashboard (port 3000)
   ├── evolution-api/      # Evolution API environment config
   └── infra/              # docker-compose.yml (Evolution API, PostgreSQL, Redis)
   ```

   ## Commands

   ### Backend (`chatfast-backend/`)
   ```bash
   npm run dev              # tsx watch (hot-reload)
   npm run build            # tsc compilation → dist/
   npm run start            # node dist/server.js
   npm run lint             # eslint src --ext .ts
   npm run lint:fix         # eslint with --fix
   npm run test             # Jest
   npm run test:coverage    # Jest with coverage
   npm run prisma:generate  # Regenerate Prisma client (run after schema changes)
   npm run prisma:migrate   # Run pending migrations (dev mode)
   npm run prisma:studio    # Prisma Studio GUI
   ```

   ### Frontend (`chatfast-frontend/`)
   ```bash
   npm run dev    # Next.js dev server
   npm run build  # Production build
   npm run lint   # ESLint
   ```

   ### Infrastructure
   ```bash
   cd infra && docker-compose up -d   # Start Evolution API, PostgreSQL 15, Redis 7
   ```

   ## Backend Architecture

   ### Layered Request Flow
   ```
   HTTP Request
     → app.ts (Helmet, CORS, compression, requestId, rateLimiter)
     → routes/index.ts (route aggregation, authenticate + requireOwnership guards)
     → routes/*.routes.ts (Zod validation via validateRequest middleware)
     → controllers/*.controller.ts (parse req, call service, use ApiResponder)
     → services/*.service.ts (business logic, Evolution API calls)
     → repositories/instances.repository.ts (Prisma ORM, only repo that exists)
     → PostgreSQL
   ```

   ### Route Map (`/api/v1`)
   | Prefix | Auth | Notes |
   |--------|------|-------|
   | `/auth` | public | login, register, refresh, logout, me |
   | `/clients` | open | client CRUD + suspend/reactivate |
   | `/admin` | ADMIN only | overview stats, paginated instances, SSE streams |
   | `/infra` | open | system metrics (CPU/RAM/disk), Docker container management |
   | `/instances` | authenticate | per-user CRUD + QR/connect/disconnect/restart/webhook |
   | `/instances/:instanceId/messages` | authenticate + requireOwnership | send
   text/media/audio/location/reaction/poll/contact |
   | `/instances/:instanceId/chat` | authenticate + requireOwnership | presence, mark-read, profile picture |
   | `/instances/:instanceId/groups` | authenticate + requireOwnership | create, members, links, settings |
   | `/instances/:instanceId/profile` | authenticate + requireOwnership | bot photo/name/status |
   | `/instances/:instanceId/sync` | authenticate + requireOwnership | fetch contacts and chat history |
   | `/instances/:instanceId/contacts` | authenticate + requireOwnership | CRM contacts + message history |
   | `/campaigns` | open | create, list, launch, pause, cancel, delete |
   | `/webhooks` | public | Evolution API callbacks (POST /webhooks/evolution) |

   ### Authentication
   - **JWT access token** (15m) + **refresh token** (7d, stored in `Session` table)
   - Roles: `ADMIN`, `OPERATOR`, `CLIENT`
   - `requireOwnership(paramName?)` middleware: verifies `instance.clientId === req.user.id`; ADMIN bypasses
   - **Dev bypass**: `authenticate` middleware sets `req.user = { id: 'dev-user-id', role: 'ADMIN' }` when
   `NODE_ENV=development`
   - Two rate limiters: `rateLimiter` (60 req/min by IP+userId), `strictRateLimiter` (5 req per 5min for QR
   endpoints)

   ### Error Handling
   - Throw `AppError` from `src/errors/AppError.ts` with factory methods: `AppError.notFound(entity)`,
   `AppError.instanceDisconnected(name)`, `AppError.evolutionError(message)`
   - `errorHandler` middleware (in `src/middleware/errorHandler.ts`) also catches `ZodError` and
   `PrismaClientKnownRequestError` (P2002 → DUPLICATE, P2025 → NOT_FOUND)
   - Note: `AppError` is defined in **two places** — `src/errors/AppError.ts` (canonical, with factory methods) and
   `src/middleware/errorHandler.ts` (older version). Services import from `src/errors/AppError.ts`.

   ### API Response Shape
   Always use `ApiResponder` from `src/utils/apiResponse.ts`:
   ```typescript
   ApiResponder.success(res, data, message?, statusCode?)  // 200
   ApiResponder.created(res, data, message?)               // 201
   ApiResponder.error(res, message, code, statusCode, details?)
   ApiResponder.noContent(res)                             // 204
   ```
   All responses include `meta: { timestamp, requestId, version: "1.0.0" }`.

   ### Evolution API Integration
   - Client: `src/config/evolution.ts` — Axios instance with `apikey` header, 30s timeout, request/response logging
   - Instance creation registers in Evolution API first, then saves to DB; webhook auto-configured to
   `BASE_URL/api/v1/webhooks/evolution`
   - Evolution API v2 webhook payload must be wrapped: `{ webhook: { enabled, url, byEvents: false, base64: false,
   events: [...] } }`
   - Status mapping: `open → CONNECTED`, `connecting → CONNECTING`, `close → DISCONNECTED`, `refused → ERROR`
   - Evolution API errors normalized by `extractEvolutionError()` helper (handles v1 and v2 response formats)
   - Instance deletion from Evolution API is best-effort (non-blocking on failure); disconnect on logout is also
   best-effort

   ### Webhook Processing (`webhook.service.ts`)
   Handles `MESSAGES_UPSERT` and `CONNECTION_UPDATE` from Evolution API:
   - Normalizes 3 Evolution API payload formats for `messages.upsert`
   - Upserts `Contact` and `Message` records via Prisma
   - `pollUpdateMessage` votes detected via `isPollVote()` and routed to `handlePollVote()` (automation TODO stub
   present)
   - Empty `selectedOptions` = deselection (ignored)

   ### Campaign Execution
   `campaign.service.ts` → `runCampaign()` runs in background (no await). Checks `PAUSED`/`CANCELLED` status before
   each message. Uses `delayMs` (default 1500ms) between sends. Evolution API endpoint: `POST
   /message/sendText/:instanceName`.

   ### SSE (Server-Sent Events)
   - `GET /admin/instances/live` — streams instance snapshots every 5s
   - `GET /admin/logs` — streams Winston log entries in real-time
   - `GET /infra/metrics/live` — streams system metrics
   - `GET /infra/containers/:id/logs` — streams Docker container logs (tail=100, follow=true)

   ### Logging
   Winston logger (`src/config/logger.ts`): console (colorized) + file (`logs/error.log`, `logs/combined.log`), 5MB
   max, 5 rotated files. Level controlled by `LOG_LEVEL` env var.

   ## Database Schema (Prisma)

   ```
   Client (id, name, email, password, phone, role: Role, plan: Plan, active, suspended)
     ├─ Instance (id, name, evolutionApiId, clientId, status: InstanceStatus, connectionType, apiKey, qrCode, config:
    Json)
     │   ├─ InstanceMetrics (instanceId, messagesIn, messagesOut, errors, timestamp)
     │   ├─ Event (instanceId, type: EventType, payload: JsonB, processed, error)
     │   ├─ Contact (instanceId, remoteJid, name, phone, isGroup, lastMessage, unreadCount)
     │   │   └─ Message (contactId, instanceId, remoteJid, messageId, fromMe, type, content, status, timestamp)
     │   └─ Campaign (clientId, instanceId, name, message, status: CampaignStatus, delayMs, sentCount, failedCount)
     │       └─ CampaignItem (campaignId, phone, name, status: CampaignItemStatus, sentAt, error)
     └─ Session (userId, token, expiresAt)
   ```

   Enums: `Role (ADMIN|OPERATOR|CLIENT)`, `Plan (FREE|BASIC|PREMIUM|ENTERPRISE)`, `InstanceStatus
   (PENDING|CONNECTING|CONNECTED|DISCONNECTED|ERROR)`, `ConnectionType (BAILEYS|WHATSAPP_CLOUD)`, `CampaignStatus
   (DRAFT|SCHEDULED|RUNNING|PAUSED|COMPLETED|CANCELLED)`, `EventType`.

   Key unique constraints: `Instance.name`, `Contact(instanceId, remoteJid)`, `Message(instanceId, messageId)`.

   ## Frontend Architecture

   ### State Management
   - **Zustand** (`src/store/auth.store.ts`): auth state persisted to localStorage as `chatfast-auth`. Also writes
   `accessToken`/`refreshToken` directly to localStorage for the Axios interceptor.
   - **TanStack Query** (`src/app/providers.tsx`): `staleTime: 30s`, `retry: 1`. Used for all server data (instances,
    campaigns, contacts, admin stats).
   - Dashboard layout (`src/app/(dashboard)/layout.tsx`): waits for Zustand hydration (`mounted` state) before
   redirecting to `/login` to avoid flash on reload.

   ### API Client (`src/lib/api.ts`)
   Axios instance with `NEXT_PUBLIC_API_URL` base (default `http://localhost:3001/api/v1`). Request interceptor
   attaches `Bearer` token from localStorage. Response interceptor on 401: auto-refreshes token via `POST
   /auth/refresh` then retries, or clears auth and redirects to `/login`.

   API modules exported: `authApi`, `overviewApi`, `instancesApi`, `clientsApi`, `contactsApi`, `campaignsApi`,
   `infraApi`. SSE URLs exported as `SSE_URLS` object.

   ### Pages (App Router, all in `src/app/(dashboard)/`)
   `overview/`, `instances/`, `campaigns/`, `contacts/`, `inbox/`, `clients/`, `infra/`, `logs/`

   ### UI Components (`src/components/`)
   Reusable: `Card`, `Badge` (with `instanceStatusBadge` helper), `Button`, `Input`, `Spinner`/`PageSpinner`. Layout:
    `Sidebar`, `Header`. All use Tailwind CSS 4 with `cn()` (clsx + tailwind-merge).

   ### Page transitions
   Dashboard layout wraps `{children}` in `AnimatePresence + motion.div` (Framer Motion) for fade/slide transitions.

   ## Environment Variables

   Backend requires (validated with Zod on startup — process exits on failure):
   ```
   PORT=3001
   NODE_ENV=development|production|test
   DATABASE_URL=postgresql://...
   EVOLUTION_API_URL=http://localhost:8080
   EVOLUTION_API_KEY=...
   JWT_SECRET=<32+ chars>
   JWT_REFRESH_SECRET=<32+ chars>
   JWT_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   LOG_LEVEL=info|debug|warn|error
   CORS_ORIGIN=http://localhost:3000
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=60
   BASE_URL=http://localhost:3001   # used for auto-webhook setup
   ```

   Frontend:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
   ```

   ## Docker Services (infra/docker-compose.yml)
   | Container | Image | Port |
   |-----------|-------|------|
   | evolution_api | evoapicloud/evolution-api:latest | 8080 |
   | evolution_manager | evoapicloud/evolution-manager:latest | 3000→80 |
   | evolution_postgres | postgres:15-alpine | 5432 |
   | evolution_redis | redis:7-alpine | 6379 |

   Network: `evolution_net` (bridge). Volumes: `evolution_instances`, `evolution_postgres_data`,
   `evolution_redis_data`.

   Note: evolution-manager has an nginx bug patch in its entrypoint (removes `must-revalidate` from nginx config).

   ## Swagger API Docs
   `http://localhost:3001/api-docs` — Bearer auth. Scanned from `src/routes/*.ts` and `src/controllers/*.ts`.

   ## Known Incomplete / TODO Items
   - `getMetrics()` in `instances.service.ts` returns a stub (always zeros) — TODO comment present
   - `handlePollVote()` in `webhook.service.ts` has a full automation stub (commented out) ready to implement
   - No existing test files found — test infrastructure is configured (Jest) but tests are not written yet