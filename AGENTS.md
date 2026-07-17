# Arakne

Arakne is a hackathon project (hack4freedom, women-only): a crochet/weaving
learning app that is secretly a peer-to-peer microcredit network over Lightning
Network, for women facing coercive financial control. The crochet catalog is the
visible surface; financial features are revealed by hidden search gestures. UI
and code comments are in Portuguese (pt-BR). 2-space indentation.

## Two independent apps coexist in this repo

This is the most important thing to know. There are **two separate apps** that
share a repo but have different stacks, commands, and test setups:

| | Root `src/` (Nostr client) | `backend/` + `frontend/` (Arakne app) |
|---|---|---|
| Package name | `mkstack` (`package.json`) | `arakne-frontend` (`frontend/package.json`) + FastAPI |
| Stack | React 19, Vite, Tailwind 4, shadcn/ui, Nostrify | FastAPI + SQLAlchemy/SQLite; React 18 + Vite |
| Port | 8080 | backend 8000, frontend 5173 |
| Commands | `npm run dev/build/test` at repo root | see Backend / Frontend sections below |
| Tests | `tsc --noEmit` + `eslint` + `vitest` | `pytest` (backend); none (frontend) |
| Documented in | this file (Nostr sections) | `README.md` |

**Figure out which app a task targets before touching anything.** The root
`index.html` is titled "Arakne" and its CSP allows `connect-src
http://localhost:8000`, so the root app is intended to talk to the backend — but
the two Node projects are fully separate (different React majors, different
`node_modules`, different vite configs).

**The root `src/` app is a hybrid**, not a pure Nostr client: alongside the
Nostr pages it also ships Arakne pages (`FinancialPage`, `DecoyPage`,
`InvitePage`) with routes `/materiais`, `/galeria`, `/convite/:codigo` in
`AppRouter.tsx`. The `frontend/` app is a separate, standalone Arakne frontend
(no Nostr). When working on Arakne UI, check both — the root app's `npm run test`
covers its Arakne pages too.

## Commands

### Root Nostr client (repo root)

```bash
npm run dev      # vite dev server on :8080 (runs npm i first)
npm run build    # vite build + copies dist/index.html -> dist/404.html
npm run test     # npm i && tsc --noEmit && eslint --cache && vitest run && vite build
```

`npm run test` is the canonical validation for the root app. It chains
typecheck → lint → unit tests → production build; all must pass.

### Backend (`backend/`)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000     # entrypoint: app/main.py
pytest                                         # tests (pytest.ini sets pythonpath=.)
python seed_demo.py                            # reset DB + create demo Usuária A
python run_demo.py                             # end-to-end demo flow via API (<10s, mock mode)
```

### Frontend — Arakne app (`frontend/`)

```bash
cd frontend
npm install
npm run dev      # vite on :5173, proxies /api -> backend (strips /api prefix)
npm run build    # tsc && vite build
```

### Docker (full stack, demo/local)

```bash
docker compose up --build            # Bitcoin(regtest:18443) + LND(10009) + LNbits(5000) + backend(8000) + frontend(5173)
bash scripts/init-lightning.sh       # run AFTER compose up: mines blocks, funds LND wallet
```

## CI and validation scope

- **CI is GitLab**, not GitHub. `.gitlab-ci.yml` runs `npm run test` then deploys
  `dist/` as GitLab Pages on the default branch. `.github/workflows/` exists but
  is **empty** — do not assume GitHub Actions.
- **CI only covers the root Nostr client.** The Arakne `backend/` and `frontend/`
  are NOT built or tested by CI. Run `pytest` (backend) manually.
- After any change, validate the app you touched: root → `npm run test`;
  backend → `pytest`; frontend → `npm run build`.

## Backend notes (FastAPI)

- **Entrypoint** `backend/app/main.py` → `uvicorn app.main:app`. Routers: `health,
  auth, usuarias, avais, emprestimos, pontos_troca` (6). Models: `Usuaria, Sessao,
  Padrao, ProgressoPadrao, Emprestimo, Aval, Troca` (7). **`README.md` is stale**
  here — it lists 5 routers / 6 models and omits `pontos_troca` / `Troca`. Trust the
  code.
- **No Alembic.** Schema is created via `Base.metadata.create_all()` on startup
  (idempotent — only creates missing tables). `main.py` has a **schema-drift safety
  net**: if the existing `usuarias` table is missing columns, it drops and recreates
  all tables. SQLite file is `backend/arakne.db` (gitignored). To change a column,
  expect to reset the DB.
- **Mock mode by default.** With no `LNBITS_ADMIN_KEY` / `LNBITS_POOL_KEY`, the
  LNbits service simulates invoices. Real Lightning requires those env vars (create
  wallets in LNbits at :5000 first). See `.env.example`.
- **Tests** (`backend/app/tests/conftest.py`) use an in-memory SQLite per test and
  force `lnbits._mock = True` (autouse). The `client` fixture overrides `get_db`.
- **Auth model**: pseudonymous — no real identity. Usuária provides a PIN; system
  generates an opaque `identificador` (the only login credential) + `codigo_indicacao`.
  PIN hashed with bcrypt; session tokens are opaque, 30-day expiry. `avalista_id`
  exists for the risk engine but is **never shown in the UI**.
- **CORS** is `allow_origins=["*"]` with `allow_credentials=False` — intentional
  (Bearer-token auth, no cookies), documented in `main.py`.

## Frontend notes (Arakne app, `frontend/`)

- **No React Router.** `frontend/src/App.tsx` is a hand-rolled state machine over a
  `View` union, with `window.location.pathname` only for the `/convite/{codigo}`
  invite route and `popstate` for back navigation. Add views by extending the `View`
  union and the conditional render chain.
- **API client** is `frontend/src/api.ts` — all backend calls go through `/api`
  (vite proxy strips the prefix). It also owns all `localStorage`/`sessionStorage`
  keys (`arakne_*`).
- **Disguise model**: the catalog is the visible app. Financial screens are revealed
  by search gestures from inside the catalog (e.g. searching "Ponto Arakne" →
  financial screen; "Galeria de Padrões" → decoy). Preserve this when editing —
  financial surfaces must stay non-obvious.
- **PIN is stored in `localStorage`** (`arakne_pin`) so auto-relogin works. This is
  a known trade-off for the threat model (coercive-control scenario), not a bug.
- **No test or lint config of its own.** `npm run build` (`tsc && vite build`) is
  the only typecheck; `tsconfig.json` enables `noUnusedLocals/Parameters`.

## Gotchas

- **`eslint-rules/backend/` is a stale duplicate of `backend/`.** Same files, wrong
  location. The real backend is `./backend/`. Do not edit `eslint-rules/backend/`.
- **Two MCP configs**: `opencode.json` (nostr MCP only) and `.mcp.json` /
  `.vscode/mcp.json` (js-dev + nostr). The nostr MCP gives NIP/kind/tag tools used
  by the root app's Nostr workflows.
- **`eslint-rules/`** holds custom rules loaded by the root `eslint.config.js`:
  `no-inline-script` (no `<script>` with inline content in HTML), `no-placeholder-comments`
  (flags comments starting with "// In a real"), `require-webmanifest`. These apply
  to the root app only.
- **No `NIP.md`** exists — the root Nostr client defines no custom kinds. Create it
  only if you introduce one.

## Root Nostr client — repo-specific guidance

The root `src/` app is a Nostr client built on Nostrify. Detailed workflows live as
loadable skills in `.agents/skills/` (discoverable via the `skill` tool); load the
matching skill instead of guessing. Key pointers:

- **Stack**: React 19 (ref-as-prop, no `React.forwardRef`), Tailwind 4, shadcn/ui
  primitives in `@/components/ui`, React Router (`AppRouter.tsx`), TanStack Query,
  Nostrify (`@nostrify/react`). **Never use the `any` type.**
- **`App.tsx`** is already wired with `QueryClientProvider`, `NostrProvider`,
  `UnheadProvider`, `AppProvider`, `NostrLoginProvider`. **Read it before editing**;
  changes are rarely needed. Same for `AppRouter.tsx` and `NostrProvider`.
- **UI component pattern** (`@/components/ui/*`): plain function components, props
  typed via `React.ComponentProps<...>`, `ref` forwarded as a normal prop, root tagged
  with `data-slot`, classes merged with `cn()`, variants via `class-variance-authority`.
  Radix imports come from the unified `radix-ui` package, not `@radix-ui/react-*`.
  Copy an existing `ui/` component as a template.
- **Path alias**: `@/*` → `./src/*` (tsconfig + vite).
- **Routing**: all NIP-19 identifiers (`npub1`, `note1`, `naddr1`, …) are routed at
  the URL root `/:nip19` and handled by `src/pages/NIP19Page.tsx` — never nest them
  under `/note/`, `/profile/`, etc. Add new routes in `AppRouter.tsx` **above** the
  catch-all `*`. See the `nip19-routing` skill.
- **Key hooks**: `useNostr` (`nostr.query/event/req`), `useAuthor` (kind-0 metadata),
  `useCurrentUser`, `useNostrPublish` (auto-adds `client` tag; guard with
  `useCurrentUser`), `useUploadFile`, `useAppContext`. Discover the rest with
  `ls src/hooks/`.
- **Login**: use `<LoginArea />` from `@/components/auth/LoginArea` — do not wrap it
  in conditional logic. Social apps should also include a profile/account menu in
  main nav.

### Nostr security model — CRITICAL

Nostr private keys (`nsec`) are stored **in plaintext in `localStorage`**. Any JS on
the origin can steal them; one XSS = permanent, unrecoverable key theft across every
Nostr client the user ever uses. **Treat XSS as the top-priority security concern.**

- Never use `dangerouslySetInnerHTML` / `innerHTML` / `document.write` with event
  data, URL params, or other untrusted strings.
- `index.html` ships a restrictive CSP (`script-src 'self'`, `default-src 'none'`).
  Never relax it with `'unsafe-eval'`, `'unsafe-inline'` on `script-src`, or wildcards.
- Sanitize every event-sourced URL (`sanitizeUrl()` — https-only) before using it as
  `href`/`src`/iframe `src`/CSS `url()`. Sanitize every event-sourced string
  interpolated into CSS.
- Nostr is permissionless — signatures prove authorship, not trust. Filter by
  `authors` whenever trust is implied: admin/moderator queries, addressable events
  (kinds 30000–39999), user-owned replaceable events, and routes for those events
  (include the author in the URL). Public UGC (kind 1, reactions, feeds) does not
  need author filtering.

For the full threat model (CSP walkthrough, sanitizers, NIP-72 moderation,
pre-merge checklist) load the **`nostr-security`** skill.

### Nostr data design (when adding kinds/tags)

- Review existing NIPs first (NIP index tool); prefer extending an existing kind over
  creating a custom one. Only generate a new kind when no NIP covers the case — and
  if a kind-generation tool is available, use it. Custom kinds MUST include a NIP-31
  `alt` tag; document them in `NIP.md`.
- Kind = schema, tags = semantics. Relays only index single-letter tags — use `t` for
  categories so `'#t': [...]` filters work at the relay. Filter at the relay, not in JS.
- `content` is for freeform text or industry-standard JSON (GeoJSON, etc.); kind 0 is
  the exception where structured JSON goes in `content`. If you need to filter on a
  field, it **must** be a tag. `content: ""` is idiomatic for tag-only events.
- Combine kinds in one filter (`{ kinds: [1, 6, 16], '#e': [id] }`) and split in JS
  rather than running parallel queries. Validate strict-schema kinds with a predicate
  after querying.

### Specialized Nostr workflows (load the skill)

- `nip19-routing` — populate `NIP19Page`, build NIP-19 links, secure filters.
- `file-uploads` — `useUploadFile` + Blossom + NIP-94 `imeta`.
- `nostr-encryption` — NIP-44 / NIP-04 via the user's signer.
- `nostr-relay-pools` — `nostr.relay(url)` / `nostr.group([urls])`.
- `nostr-comments`, `nostr-infinite-scroll`, `nwc`, `onchain-bitcoin`,
  `edit-profile`, `relay-management`, `nip85-stats` — see skill list.

## Design standards (root app)

Production-ready, responsive down to ~360px. WCAG 2.1 AA contrast, full keyboard
nav, visible `focus-visible` rings. 8px grid (Tailwind's 4-scale — no `p-[13px]`
one-offs). Soft shadows, `rounded-lg`/`rounded-xl`, gentle gradients. Purposeful
motion with `motion-safe:`/`motion-reduce:` variants. Use skeletons for structured
loading, spinners only for buttons. For fonts, color schemes, light/dark theming, or
the `isolate` + negative-z-index gotcha, load the **`theming`** skill.

## Workflow conventions

- **Always read an existing file before modifying it.** Never overwrite `App.tsx`,
  `AppRouter.tsx`, or `NostrProvider` without reading first.
- **Running tests is mandatory** after any code change; the task is not complete
  until the relevant validation passes (root: `npm run test`; backend: `pytest`).
- **Writing new test files**: don't, unless the user asks. If they do, load the
  `testing` skill for the Vitest + `TestApp` setup.
- **Git**: review changes with `git status`/`git diff`; learn conventions with
  `git log`. `git checkout` restores files after a mistake. **Always commit when
  finished** — every completed task ends with a commit.
- This file (`AGENTS.md`) defines assistant behavior; edit it directly to change
  guidelines (takes effect next session).
