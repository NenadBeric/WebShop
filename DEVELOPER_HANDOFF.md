# WebShop — handoff za developera (dogovor + implementacija)

Ovaj dokument je **operativna specifikacija** nastala na osnovu dogovora sa product/stakeholder stranom. Pun funkcionalni MVP opis (katalog, statusi, recepcija, zamene, notifikacije, CSV, itd.) ostaje u **`WebShop.md`** — ovde su **arhitektonski i identitetski dogovori** bez kojih implementacija lako diverguje.

**Pravilo:** Ako nešto nije ovde ni u `WebShop.md`, dogovoriti pre merge-a.

---

## 0. Faze isporuke (redosled obavezan)

### Faza 1 — **Potpuno nezavisna** WebShop aplikacija

- Celokupan MVP iz **`WebShop.md`** (katalog, korpa, narudžbine, statusi, recepcija, zamene, CSV, notifikacije po spec-u, multitenant, **višejezičnost 2.8**).
- **Bez** obaveze da Trainify ili bilo koji spoljni sistem radi ili se deploy-uje.
- **Priprema za Fazu 2** (bez implementacije kanala u ovoj fazi):
  - U bazi od prvog dana: `order_sources`, na `narudžbama` polja **`source_id`**, **`external_ref`** (i po potrebi `source_metadata`).
  - Seed za `order_sources`: uvek **`WEBSHOP`**; **`TRAINIFY`** dodati u istoj ili ranoj migraciji (red postoji, API pozivi još ne dolaze) — da se ne menja šema u trenutku integracije.
  - API rute koje će Trainify kasnije koristiti (npr. `GET .../for-training-type`, `POST .../orders` sa `source=TRAINIFY`) mogu u Fazi 1 biti **implementirane kao stub** (401/403 + validacija šeme) **ili** potpuno izostavljene dok ne krene Faza 2 — ali **šema porudžbine** mora da prihvata `source_id` / `external_ref` unapred.

### Faza 2 — **Komunikacija sa Trainify-jem**

- Pozivi iz Trainify fronta/BFF-a ka WebShop API-ju, korisnikov JWT, `TRAINIFY` + `external_ref`.
- Uklanjanje stubova / uključivanje endpointa po dogovoru.

**Bitno:** Faza 1 ne sme da zavisi od Trainify repozitorijuma, ali **model podataka i autentifikacioni sloj** moraju biti dizajnirani tako da Zitadel i integracija u Fazi 2 budu **uklapanje**, ne prepisivanje jezgra.

---

## 1. Uloga sistema u ekosistemu

| Aplikacija | Uloga |
|------------|--------|
| **Trainify** | Zakazivanje treninga, operativni CRM teretane. **Ne vodi sopstvene porudžbine** — porudžbine nastaju pozivom ka WebShop API-ju. |
| **WebShop** | **Jedini izvor istine** za porudžbine proizvoda teretane (isti životni ciklus, statusi, QR, recepcija, zamene), bilo da je narudžbina kreirana sa webshop fronta ili iz Trainify-ja / drugih integracija. |

**Backendovi su odvojeni** (posebni repozitorijumi / deploy). Komunikacija između aplikacija: **HTTPS REST + JSON**. U **produkciji** je primarni token **Zitadel JWT**; za **lokalni razvoj** važi **§3** (isto ponašanje kao Trainify).

---

## 2. Referenca na postojeći kod (Trainify)

Korisno za **isti Zitadel model**, validaciju JWT-a na serveru i UX/temu:

- Frontend: `D:\Trainify-v2\frontend` (Vite + React)
  - OIDC: `src/auth/oidc-config.ts`, `AuthContext.tsx`, `OidcCallback.tsx`
  - API klijent (Bearer token): `src/api/client.ts`
  - Svetla/tamna tema korisnika: `src/lib/themeToggle.ts` + `src/index.css` (`data-theme="light"`)
- Backend: `D:\Trainify-v2\backend` (FastAPI)
  - JWT / JWKS / Zitadel normalizacija: `app/auth/oidc.py`
  - Dependency trenutni korisnik: `app/dependencies.py`
  - Settings: `app/config.py` (`OIDC_ISSUER`, `OIDC_ISSUER_EXTERNAL`, …)
  - AI / LLM (referenca za budući WebShop AI sloj): `requirements.txt` (npr. `langchain*`), `LLM_*` u `config.py`, servisi pod `app/services/` (npr. AI chat / promptovi)

### 2.1. Tehnološki stack — **obavezno usklađenje sa Trainify-jem**

WebShop se implementira u **istim tehnologijama** kao Trainify (isti tim, isti deploy/DevOps obrasci, mogućnost deljenja iskustva i eventualno biblioteka):

| Sloj | Trainify (referenca) | WebShop |
|------|----------------------|---------|
| **Backend** | Python **FastAPI**, **Uvicorn**, **SQLAlchemy 2** (async) + **asyncpg**, **Alembic**, **Pydantic v2**, **pydantic-settings**, **python-jose** (JWT), **httpx** | Isto |
| **Baza** | PostgreSQL | PostgreSQL |
| **Frontend** | **React** + **TypeScript**, **Vite** | Isto |
| **Kontejnerizacija** | Docker (kao u Trainify projektu) | Isto |
| **Testovi** | **pytest**, **pytest-asyncio** | Isto |
| **Lokalizacija** | `@lokalizacija/client`, `src/i18n/`, backend `app/i18n/messages.py` + middleware | Isto (vidi §2.3) |

Logika autentifikacije: **dva režima** kao Trainify — OIDC (Zitadel) kada je issuer konfigurisan, inače **legacy HS256** (vidi §3).

### 2.2. Planirana **AI** funkcionalnost (posle jezgra MVP-a ili u dogovorenim sprintovima)

Dogovoreno je da WebShop dobije **AI podršku** u istom Python ekosistemu kao Trainify (bez uvodenja drugog backend jezika). Oblasti (product može da prioritizuje redosled):

1. **Predlaganje proizvoda** — na osnovu korpe, istorije ili kratkog konteksta (npr. cilj treninga kada postoji veza sa Trainify podacima preko API-ja).
2. **Pomoć pri odabiru** — konverzacijski ili inline asistent (slično principu AI dela Trainify aplikacije), uz jasno označavanje da je reč o predlogu, ne obavezi.
3. **Pretraga** — semantička / prirodnojezička pretraga kataloga (pored klasičnog filtera), uz iste ograničavače kao Trainify (rate limit, bez curenja PII u spoljašnji LLM bez dogovora).

**Implementacioni put:** ponovo koristiti obrasce iz Trainify backend-a (konfiguracija `LLM_PROVIDER` / `LLM_API_KEY` / model, opciono Langfuse, prompt fajlovi ili registry kao u `app/services/ai*`). Konkretne rute (`POST /api/v1/.../suggest`, `.../search`) i tačan obim **nisu** deo minimalnog MVP opisa u `WebShop.md` — dodati u backlog i ovaj dokument ažurirati kada budu fiksirani endpointi.

**Napomena:** Jezgro MVP-a (katalog, narudžbine, recepcija, CSV, Žitadel) može da se isporuči **bez** uključenog AI-ja; arhitektura (Python, FastAPI, konfigurabilan LLM sloj) treba od početka da **ne blokira** dodavanje AI ruta i jobova.

**Detaljna AI specifikacija (po rolama, faze, bezbednost):** **`WEBSHOP_AI.md`**.

### 2.3. Višejezičnost (lokalizacija) — **obavezno u MVP-u** (isto kao Trainify)

**Cilj:** isti korisnički osećaj kao Trainify — promena jezika menja ceo UI, serverske greške i (gde je primenjivo) mejlove, na **`sr` | `en` | `ru` | `zh`**.

#### Frontend (referenca: `D:\Trainify-v2\frontend\src\i18n\`)

- Paket **`@lokalizacija/client`** (`loadTranslations`), kao u `package.json` Trainify-ja.
- **`src/i18n/setup.ts`:** `initI18n` / `changeLanguage` sa opcionim `VITE_L10N_BASE_URL` i `VITE_L10N_APP_KEY`; **`appCode`** za WebShop npr. `webshop` (ne mešati sa `trainify` osim ako centralni servis eksplicitno podržava oba).
- **Lokalni fallback:** bundled JSON po jeziku (`sr.json`, `en.json`, `ru.json`, `zh.json`) sa istim ključevima kao u Trainify obrascu (`t('key')`).
- **`I18nProvider`** + `useI18n()` oko aplikacije (vidi Trainify `main.tsx`).
- **Perzistencija:** `localStorage` ključ npr. **`webshop_lang`** (vrednosti `sr` | `en` | `ru` | `zh`); pri svakom `fetch` ka API-ju slati header **`Accept-Language`** iste vrednosti (kao Trainify `api/client.ts` sa `trainify_lang`).
- **UI izbor jezika:** ekran podešavanja / profil / header — minimalno isto pokrivenost kao Trainify profil.

#### Backend (referenca: `D:\Trainify-v2\backend\app\i18n\messages.py`)

- **`I18nMiddleware`** na Starlette/FastAPI: parsira `Accept-Language`, postavlja **contextvar** za jezik zahteva (isti obrazac kao `I18nMiddleware` + `_current_lang` u Trainify-ju).
- Funkcija **`tr("message_key", ...)`** za sve korisnički vidljive `HTTPException` poruke i validacije — rečnik `MESSAGES[key][lang]` za `sr`, `en`, `ru`, `zh`.
- **`SUPPORTED_LANGS`** i fallback na `sr` ako jezik nije podržan (usklađeno sa Trainify `_parse_lang` logikom).

#### Mejlovi i šabloni

- Šabloni notifikacija (potvrda narudžbine, zamena, itd.) birati jezik po **`webshop_lang`** sačuvanom uz narudžbinu ili po `Accept-Language` u trenutku kreiranja — dogovoriti jedan kanonski izvor; u MVP-u dovoljno je konzistentan izbor (npr. jezik iz JWT profila nema u legacy režimu → koristiti header).

#### Katalog proizvoda (sadržaj)

- **UI stringovi** (dugmad, statusi, labeli) = obavezno svi jezici.
- **Naziv/opis proizvoda u bazi:** po `WebShop.md` §2.8 može u prvom MVP-u biti jedan jezik; ako se kasnije uvodi višejezični katalog, dodati tabelu tipa `product_translation` — ne blokira isporuku MVP UI lokalizacije.

---

## 3. Lokalni razvoj **bez** Zitadela (isto kao Trainify)

**Cilj:** na mašini developera raditi bez podignutog Zitadela, istim UX obraskom kao Trainify.

### Frontend

- Ako **nisu** postavljeni `VITE_OIDC_AUTHORITY` i `VITE_OIDC_CLIENT_ID` (ili ekvivalent koji tim dogovori), aplikacija je u režimu **„lokalni login“**: forma **email + lozinka**, poziv na backend npr. `POST /api/v1/auth/login` (tačan path tim definise), odgovor sadrži **access token** koji se čuva na isti način kao Zitadel token (npr. `localStorage` ključ po izboru, analogno `trainify_token`).
- Kada su OIDC env promenljive postavljene, koristi se **redirect na Zitadel** + `/callback`, kao u Trainify `oidc-config.ts` / `OidcCallback.tsx`.

### Backend

- Kada **`OIDC_ISSUER` (ili ekvivalent) nije** postavljen: isti obrazac kao Trainify `app/auth/oidc.py` + `decode_token` — **izdavanje i provera HS256 JWT** pomoću deljenog tajnog ključa iz env (`JWT_SECRET`), sa claimovima koje WebShop očekuje u svim rutama: npr. **`sub`**, **`role`**, **`tenant_id`** (string ili int po dogovoru), opciono `email`, `name`.
- Kada je **issuer postavljen**: validacija preko **JWKS**, RS256, normalizacija Zitadel claimova (kao Trainify).
- **Produkcija:** uvek konfigurisan OIDC issuer; **legacy login endpoint isključen** (feature flag `ALLOW_LEGACY_AUTH=false` ili odbijanje ako `ENVIRONMENT=production`).

### Korisnici za lokalni režim

- `WebShop.md` za produkciju predviđa **bez** tabele korisnika (identitet iz Zitadela). Za **development-only**, dozvoljena je **minimalna** tabela ili seed (hashirane lozinke) **samo** kada je legacy režim uključen — analogija Trainify `User` + `/auth/login`. Te podatke **ne migrirati** kao izvor istine za produkciju.

---

## 4. Žitadel — jedan project, dve aplikacije

**Primena:** nakon što je OIDC konfigurisan (tipično staging/produkcija i opciono lokal ako imate Zitadel).

- Trainify i WebShop koriste **isti Zitadel project** (ista organizacija, isti `sub` za istog korisnika).
- U Zitadelu: **dva OIDC klijenta** (npr. „Trainify SPA“, „WebShop SPA“), različiti **redirect URI**-ji, isti tip korisnika.
- Frontend scope: uskladiti sa Trainify (npr. `openid profile email` + Zitadel project audience claim koji već koristite u Trainify — vidi `oidc-config.ts`).
- **Access token** sa WebShop fronta i sa Trainify fronta šalje se kao `Authorization: Bearer <access_token>` na odgovarajući backend.

### 4.1. Tenant (`tenant_id`)

- Izvor tenanta: Zitadel claim koji Trainify već mapira na `tenant_id` u `app/auth/oidc.py` — **`urn:zitadel:iam:org:id`** (ili dogovoreni ekvivalent iz vašeg projekta).
- Svi entiteti u WebShop bazi vezani za `tenant_id` (katalog, narudžbe, konfiguracija notifikacija).

### 4.2. Audience (`aud`)

**Ciljno stanje:** WebShop API **validira `aud`** (lista dozvoljenih audience vrednosti iz konfiguracije), čim je u Zitadelu WebShop registrovan kao API/resource i klijenti dobijaju ispravan audience.

**MVP dopuštenje:** ako konfiguracija kaše, kratko može biti isti prag kao Trainify (`verify_aud: false` u `jwt.decode`) — ali **planirati zategnuće** čim Zitadel resource bude spreman.

---

## 5. Uloge (Zitadel project roles)

### 5.1. Jedan globalni administrator

| Zitadel key | Namena |
|-------------|--------|
| **`ADMIN`** | **Jedan** ključ za održavanje **svih** aplikacija (Trainify + WebShop + buduće). Isti tip uloge kao što Trainify već koristi u prioritetu u `normalize_claims`. |

Korisnik sa `ADMIN` u projektu treba da ima potrebne dozvole u **obema** aplikacijama (konkretna pravila u RBAC matrici ispod).

### 5.2. WebShop-specifične uloge (prefiks `WEBSHOP_`)

Koriste se da se **ne sudaraju** sa Trainify ulogama (`TRAINER`, `CLIENT`, `GYM_MANAGER`, …) u istom JWT `urn:zitadel:iam:org:project:roles` objektu.

| Zitadel key | Namena |
|-------------|--------|
| **`WEBSHOP_OWNER`** | Vlasništvo / najviši nivo za shop u okviru tenanta (ugovor sa timom). |
| **`WEBSHOP_MANAGER`** | Operativno upravljanje shopom (katalog, izveštaji, podešavanja koja nisu čisto recepcijska). |
| **`WEBSHOP_RECEPTION`** | **Recepcija i kuhinja u jednoj ulozi:** panel narudžbina, QR, odobravanje, zamene, „preuzeto“, **i** notifikacije tipa priprema šejkova (u `WebShop.md` su bile odvojene `reception` / `kitchen` — **ovde su namerno ujedinjene**). |
| **`WEBSHOP_CUSTOMER`** | Kupovina sa kataloga / korpa (član ili gost sa nalogom — po modelu dozvola). |

**Trainify** i dalje parsira samo svoje poznate uloge; **`WEBSHOP_*`** ne ulaze u Trainify prioritet — nema mešanja logike.

### 5.3. RBAC matrica (smernice za implementaciju)

Prilagoditi tačno endpointima; ovo je minimalni okvir:

| Akcija / oblast | WEBSHOP_CUSTOMER | WEBSHOP_RECEPTION | WEBSHOP_MANAGER | WEBSHOP_OWNER | ADMIN |
|-----------------|-------------------|-------------------|-----------------|---------------|-------|
| Pregled kataloga (dostupni proizvodi) | da | da | da | da | da |
| Kreiranje svoje narudžbine | da | opciono | da | da | da |
| Recepcijski panel, statusi, zamene, QR | ne | da | da | da | da |
| Uvoz/izvoz CSV, masovni katalog | ne | ne | da | da | da |
| Sistem / više tenanata / cross-app održavanje | ne | ne | po dogovoru | po dogovoru | **da** |

*(„Opciono“ za recepciju kao kupac — product odluka; podrazumevano **ne** ako recepcija ne kupuje u smenu.)*

---

## 6. Integracija Trainify → WebShop (**Faza 2**)

- **Izvor narudžbine** mora biti eksplicitno postavljen (vidi §7).
- **Glavni način autentifikacije:** **korisnikov access token** (Zitadel JWT) kada korisnik u Trainify UI-u potvrdi kupovinu uz trening. WebShop iz tokena čita `sub`, email, `tenant_id`, proverava dozvole.
- **Servisni (m2m) token:** rezervisano za batch, sinhronizacije, buduće sisteme bez korisnika u sesiji — **ne** kao podrazumevani put za narudžbinu iz booking toka. Ako se koristi, telo zahteva mora nositi identitet klijenta (`zitadel_sub` / slično) i poziv mora biti ograničen na poverene klijente.

### 6.1. API ugovor (primer iz `WebShop.md`, proširiti)

- `GET /api/v1/products/for-training-type?type=...` — lista za modal u Trainify-ju.
- `POST /api/v1/orders` — kreiranje narudžbine (isto telo kao sa webshop fronta gde god je moguće + `source_id` / `source_code` + opciono `external_ref`).
- Kasnije: linkovi / embed iz `WebShop.md` (iframe izveštaji, dugme „obrada porudžbine“) — po prioritetu product-a.

Trainify tim implementira **klijentske pozive** i eventualno BFF; WebShop tim implementira **endpointe i validaciju** kada krene Faza 2.

---

## 7. Izvor narudžbine (`order_source`) — šema i vrednosti v1

**Odluka:** **referentna tabela** (ne Postgres `ENUM`), radi novih kanala bez `ALTER TYPE`.

### 7.1. Tabela `order_sources` (naziv može biti `integration_channels` — bitno je da je jasno)

Predložene kolone:

- `id` (PK, serial/uuid)
- `code` **TEXT UNIQUE NOT NULL** — stabilan string za kod i API (npr. `WEBSHOP`, `TRAINIFY`)
- `display_name` — za admin UI / izvještaje
- `active` BOOLEAN DEFAULT true
- opciono: `metadata` JSONB, `created_at`

### 7.2. Tabela `narudzbe` (proširenje u odnosu na `WebShop.md`)

Dodati (pored polja iz originalne specifikacije):

- `source_id` **NOT NULL FK → `order_sources.id`** (ili `source_code` + FK na `code` — izabrati jedan stil i držati se ga)
- `external_ref` **TEXT NULL** — ID entiteta u izvornom sistemu (npr. Trainify appointment id) za podršku i debug
- opciono: `source_metadata` JSONB NULL — proširenja bez migracije

### 7.3. Seed vrednosti za v1

| `code` | `display_name` (primer) |
|--------|-------------------------|
| `WEBSHOP` | WebShop (direktno sa sajta) |
| `TRAINIFY` | Trainify (booking / trening tok) |

Novi sistemi kasnije: **INSERT** u `order_sources` + eventualno dokumentacija u ovom fajlu.

---

## 8. UI / tema (MVP)

- **Bez** per-tenant gym brenda kao pun Trainify „gym theme“ modal u prvoj fazi.
- **Da:** ista filozofija kao Trainify **korisnička** svetla/tamna tema (`data-theme="light"` / podrazumevano tamno), usklađene boje i komponente (`index.css` kao referenca tokena).
- Cilj: **vizuelna i UX konzistentnost** sa Trainify-jem, ne kopiranje svih ekrana.

---

## 9. Redosled implementacije (Faza 1 → Faza 2)

### Faza 1 — nezavisna aplikacija

1. Repo + Docker + PostgreSQL + migracije.
2. **i18n skelet** (§2.3): `I18nProvider`, prazan/minimalan JSON po jeziku, `Accept-Language` u API klijentu, backend `I18nMiddleware` + `tr()` za sve nove greške.
3. **Auth sloj sa dva režima** (kao Trainify): legacy HS256 kada nema OIDC issuera; JWKS + Zitadel kada ima (vidi §3 i §4).
4. **Lokalni login** (email/lozinka) + seed korisnici **samo** za `development` / kada je legacy uključen.
5. `order_sources` (seed `WEBSHOP` + po želji unapred `TRAINIFY`) + `narudzbe` sa `source_id`, `external_ref`.
6. CRUD katalog (tenant-scoped) + ručni `dostupan`.
7. Korisnički tok: korpa → narudžbina sa **`WEBSHOP`** izvorom → mejl + QR (**mejlovi na jeziku korisnika**, §2.3).
8. Recepcijski panel (uloge iz §5 — u legacy toku isti stringovi u JWT claim `role`).
9. Zamene i statusi po `WebShop.md`.
10. CSV uvoz/izvoz.
11. Notifikacije (Firebase/Telegram) — primalac: **`WEBSHOP_RECEPTION`**; tekstovi/notifikacije po jeziku gde ima smisla.
12. **Kompletiranje prevoda** — svi novi stringovi u sva četiri JSON-a / centralni servis.
13. (Opciono u Fazi 1) Stub ili dokumentovan OpenAPI za buduće Trainify endpointe — **bez** obaveze povezivanja.

### Faza 2 — Trainify

14. Uključiti Zitadel u svim deploy okruženjima gde treba; onemogućiti legacy login u produkciji.
15. Trainify integracija: pozivi sa korisnikovim JWT, `TRAINIFY` + `external_ref`, implementacija endpointa iz §6.1.

### Faza 3 — AI (planirano; **Python / FastAPI kao Trainify**)

16. Uvesti LLM konfiguraciju i klijent (isti obrasci kao Trainify: env promenljive, opciono Langfuse).
17. Endpointi i/ili background jobovi za: **predlog proizvoda**, **asistenciju pri odabiru**, **naprednu pretragu** (vidi §2.2) — uz rate limiting i audit gde treba; odgovori AI u **jeziku korisnika** (`Accept-Language` / `webshop_lang`).

*(Faza 3 može da počne tek nakon stabilnog MVP-a i po product prioritetu; arhitektura Faze 1 ne sme da isključi dodavanje ovih ruta.)*

---

## 10. Checklist pred produkcijom

- [ ] HTTPS, CORS samo za poznate front origin-e
- [ ] Migracije baze verzionisane
- [ ] Zitadel: dva klijenta, redirect URI, role keys tačno kao u §5
- [ ] `aud` validacija kada je Zitadel API resource spreman
- [ ] **Legacy login i dev korisnici isključeni** u produkciji (`ENVIRONMENT=production` + obavezno podešen OIDC issuer)
- [ ] Identitet kupca u narudžbini: **`klijent_zitadel_id` = `sub`** iz Zitadel tokena (string), kao u `WebShop.md` — bez „prave“ user tabele za produkcijski katalog korisnika
- [ ] **Lokalizacija:** `sr` / `en` / `ru` / `zh` za UI + serverske poruke + mejlove (MVP); `Accept-Language` usklađen sa `webshop_lang` (vidi §2.3)

---

## 11. Izvori istine

1. **`WebShop.md`** — funkcionalni MVP (proizvodi, korpa, statusi, recepcija, notifikacije, multitenant, integracioni principi, **§2.8 lokalizacija**).
2. **`WEBSHOP_AI.md`** — AI po rolama, faze, bezbednost, tehnički okvir.
3. **Ovaj fajl** — dogovor: **stack = Python/FastAPI + React/Vite kao Trainify**; **višejezičnost MVP (§2.3)**; **Faza 1 nezavisno**, Faza 2 Trainify, Faza 3 AI (§2.2); lokalni login bez Zitadela kao Trainify; jedan `ADMIN`; `WEBSHOP_RECEPTION` = recepcija + kuhinja; tabela izvora porudžbine; tenant iz org claim-a u Zitadel režimu.

Kraj dokumenta.
