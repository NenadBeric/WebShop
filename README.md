# WebShop (MVP)

Nezavisna multitenant webshop aplikacija po `WebShop.md` i `DEVELOPER_HANDOFF.md`: **FastAPI + PostgreSQL + React (Vite)**.

## Migracije baze (Alembic)

Ako PostgreSQL radi na **localhost:5433** (podrazumevano iz `docker compose`):

```powershell
cd backend
$env:DATABASE_URL="postgresql+asyncpg://webshop:webshop@localhost:5433/webshop"
alembic upgrade head
```

Iz Docker **backend** kontejnera migracije se već pokreću u development lifespan-u; ručno: `docker compose exec backend alembic upgrade head`.

## Pokretanje (Docker)

Iz korena repozitorijuma:

```bash
docker compose up --build
```

Kopirajte `.env.example` u **`.env`** u korenu i popunite po potrebi (`TELEGRAM_BOT_TOKEN`, `OIDC_*`, `LLM_API_KEY` / `LLM_PROVIDER` kao u Trainify-ju, `VITE_*`, `L10N_PROXY_TARGET` za `/l10n` proxy u dev-u).

- **Frontend:** http://localhost:5173  
- **Backend API:** http://localhost:8000  
- **Health:** http://localhost:8000/api/health  
- **PostgreSQL:** port **5433** na hostu (kontejner `5432`)

### Lokalni nalog (bez Žitadela)

Pri prvom startu seed kreira korisnike u tenantu `demo-gym` (lozinka za sve: **`demo123`**):

| Email | Uloga |
|-------|--------|
| customer@webshop.demo | WEBSHOP_CUSTOMER |
| reception@webshop.demo | WEBSHOP_RECEPTION |
| manager@webshop.demo | WEBSHOP_MANAGER |
| owner@webshop.demo | WEBSHOP_OWNER |
| admin@webshop.demo | ADMIN |

### Varijable okruženja (opciono)

Kopija opisa u `.env.example`. `docker-compose.yml` već postavlja razumne podrazumevane vrednosti za lokalni rad.

## Razvoj bez Docker-a (opciono)

**Backend:** `cd backend && pip install -r requirements.txt`  
Postavi `DATABASE_URL` na svoj PostgreSQL, zatim `alembic upgrade head` i `uvicorn app.main:app --reload`.

**Frontend:** `cd frontend && npm install && npm run dev` — Vite proksiše `/api` na `http://localhost:8000` (ili `VITE_BACKEND_PROXY`).

## Šta je uključeno u MVP

- Katalog (dostupni proizvodi), korpa, checkout, narudžbine, QR, statusi, recepcijski panel (odobri/odbij/spremno/preuzeto).
- Zamenske ponude (API + osnovni UI na stranici narudžbine).
- CSV uvoz/izvoz proizvoda, JSON/CSV prodajni izvještaj za zatvorene narudžbine.
- `order_sources` (WEBSHOP, TRAINIFY), polja `source_id` / `external_ref` na narudžbini.
- `GET /api/v1/products/for-training-type` (priprema za Trainify).
- i18n: `sr` / `en` / `ru` / `zh` — **lokalni JSON + isti remote obrazac kao Trainify** (`VITE_L10N_BASE_URL` + `VITE_L10N_APP_KEY`, opciono Vite proxy `/l10n`).
- Dvorežimski auth kao Trainify: **legacy JWT** kada `OIDC_ISSUER` nije podešen; **JWKS** kada jeste; **`GET /api/v1/auth/me`** za Zitadel uloge; frontend **OIDC** (`VITE_OIDC_*`, `oidc-client-ts`, `/callback`).
- **Telegram** za osoblje: globalni `TELEGRAM_BOT_TOKEN`, po tenantu **chat ID** i pravila u **Firma i pravila**; nova porudžbina + podsjetnici (tačan termin / okvirni dan).
- **SMTP** po tenantu ili globalno iz env; mejl potvrde porudžbine na jeziku `preferred_lang`.
- **AI**: `POST /api/v1/ai/catalog-search` (NL pretraga kataloga), `GET /api/v1/ai/health`, rate limit (SlowAPI); uključuje se kada je podešen `LLM_API_KEY` (provajder/model kao u Trainify `.env`).
- **Embed izveštaji**: `?embed=true` na bilo kojoj ruti — sakriva sidebar/header (vidi `WebShop.md` §3.3).

## Šta još nije / pojednostavljeno

- Push notifikacije u browseru (Firebase) — nisu u MVP; in-app notifikacije ostaju.
- Produkcioni Zitadel mora ručno mapirati uloge i `OIDC_AUDIENCE` kada API resource bude spreman.

Detalji funkcionalnosti i faza: **`WebShop.md`**, **`DEVELOPER_HANDOFF.md`**.
