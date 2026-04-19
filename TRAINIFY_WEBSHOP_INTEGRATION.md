# Trainify → WebShop: integracija porudžbina

Dokument za developera u **Trainify** aplikaciji (`https://fitnes.centar.ai`). Opisuje kako Trainify može da koristi **WebShop** API da korisnik pri zakazivanju treninga (npr. personalnog) u jednom koraku naruči proizvod — tipično **šejk** — za isti termin kada će biti u teretani.

---

## 1. Cilj proizvoda

- Korisnik u Trainify-ju zakazuje trening na datum/vreme `T`.
- Pored potvrde termina (ili u koraku pre potvrde) prikaže se ponuda proizvoda iz webshopa (npr. samo tip „šejk”).
- Dugme **„Naruči za ovaj termin“** (ili slično) šalje porudžbinu u WebShop sa:
  - izabranim proizvodom i količinom,
  - **terminom preuzimanja** usklađenim sa treningom (`T` ili odmah posle treninga — dogovor sa teretanom),
  - opcionom vezom ka Trainify entitetu (ID rezervacije) preko `external_ref`.

WebShop generiše broj porudžbine, QR za recepciju i mejl; status počinje kao „čeka potvrdu“.

---

## 2. Preduslovi (infra i identitet)

| Stavka | Objašnjenje |
|--------|-------------|
| **Base URL WebShop API-ja** | Pun HTTPS URL backend-a (npr. `https://shop.teretana.rs`). Svi endpointi ispod su relativni na `/api/v1`. |
| **Isti Zitadel / OIDC** | WebShop validira `Authorization: Bearer <access_token>`. Token mora biti izdati konfiguraciji koju WebShop koristi (`OIDC_ISSUER` / JWKS). |
| **Uloga za kupovinu** | Korisnik mora imati ulogu koja dozvoljava kupovinu: npr. `WEBSHOP_CUSTOMER` (ili viša recepcijska uloga — vidi RBAC u WebShop-u). Bez toga API vraća `403`. |
| **`tenant_id` u tokenu** | Za Zitadel tokene WebShop iz `urn:zitadel:iam:org:id` puni `tenant_id`. Morati isti org kao katalog te teretane. |
| **CORS** | Ako Trainify frontend (browser) direktno zove API, origin `https://fitnes.centar.ai` mora biti u `CORS` dozvolama WebShop backend-a. Alternativa: pozivi idu preko **Trainify backend-a** (server-to-server + token korisnika prosleđen sigurno) — tada CORS za fitnes.centar.ai nije potreban za taj poziv. |
| **Izvor porudžbine** | U bazi postoji izvor sa kodom **`TRAINIFY`**. Pri kreiranju porudžbine pošalji `"source_code": "TRAINIFY"` da se u izveštajima razlikuje od `WEBSHOP`. |

### 2.1. Konkretni production URL-ovi (dopuna)

Kad budu poznati **stvarni** URL-ovi deploya, dopišite ih u tabelu ispod (bez završnog slasha na korenu API-ja, osim ako vam stack to zahteva). Trainify tim onda koristi ta polja za `fetch` / deep link na `/orders/:id`.

| Okruženje | WebShop **frontend** (SPA, npr. Vite host) | WebShop **backend** (koren gde živi `/api`, npr. reverse proxy na Uvicorn) |
|-----------|--------------------------------------------|-------------------------------------------------------------------------------|
| Production | _još nije upisano_ | _još nije upisano_ |
| Staging (opciono) | | |

**Napomena za održavanje dokumenta:** ako želite, u isti fajl može kasnije da se dopiše tačan production (i/ili staging) URL frontenda i backenda čim ih imate — dovoljno je ažurirati tabelu iznad ili zatražiti dopunu ovog `TRAINIFY_WEBSHOP_INTEGRATION.md` fajla da ostane izvor istine za integraciju.

### 2.2. Ugrađeni izveštaji (iframe)

Za prikaz bez menija (npr. u Trainify iframe-u), na bilo koji URL frontenda dodajte query **`?embed=true`** (ili `embed=1`). Korisnik mora i dalje biti autentifikovan u WebShop-u (isti JWT / sesija u iframe-u zavisi od domena i `SameSite` kolačiča — u praksi najčešće isti sajt ili token prosleđen prema dogovoru).

### 2.3. Tema brenda tenanta, light/dark i jezik (Trainify → WebShop SPA)

WebShop deli isti CSS model kao Trainify (`data-gym-theme-preset`, `data-gym-custom-primary`, `data-theme="light"`, itd.). Tema se može proslediti **pre učitavanja React-a** (query string), **iz keša** (poslednji uspešni brend), ili **runtime** porukom iz roditeljskog prozora (`postMessage`).

**Redosled pri startu** (izvor istine: `frontend/src/main.tsx`):

1. **`bootstrapLangFromUrl()`** — ako u URL-u postoji `lang` ili `locale` (`sr` \| `en` \| `ru` \| `zh`), vrednost se upisuje u `localStorage` pod ključem `webshop_lang` pre `I18nProvider`-a, tako da je ceo UI na tom jeziku pri prvom renderu.
2. **`applyTenantThemeFromCurrentUrl()`** — čita query i primenjuje tenant brend + opciono `appTheme` / `trainify_theme` (light/dark na `<html>` i isti ključ `trainify_theme` u `localStorage` radi usklađenja sa Trainify-jem).
3. Ako u URL-u **nema** `appTheme` ni `trainify_theme`, poziva se **`initThemeFromStorage()`** (preostali light/dark iz storage-a).
4. **`applyCachedTenantBrandingIfAny()`** — primena poslednjeg keširanog `TenantThemeDto` ako postoji (npr. posle prethodnog ulaska).
5. **`installCrossAppThemeListener()`** — sluša `postMessage` sa temom (vidi ispod).

#### 2.3.1. Query parametri (iframe ili deep link)

| Parametar | Primer | Značenje |
|-----------|--------|----------|
| **`embed`** | `embed=true` | Kompaktan UI (izveštaji, itd.) — vidi §2.2. |
| **`lang`** ili **`locale`** | `lang=en` | Jezik celog SPA: `sr`, `en`, `ru`, `zh` → `localStorage.webshop_lang`. |
| **`tenantTheme`** ili **`embedTheme`** | `tenantTheme=1` | „Uključi“ čitanje brenda iz URL-a zajedno sa `tenantId` (vidi `embedThemeBootstrap.ts`). |
| **`tenantId`** | `tenantId=demo-gym` | Identitet tenanta za brend; obavezan ako iz URL-a gradite `TenantThemeDto`. |
| **`appTheme`** ili **`trainify_theme`** | `appTheme=light` | Korisnički režim: `light` \| `dark` (isti smisao kao u Trainify `trainify_theme`). |
| **`themePreset`** | `themePreset=LIGHT_A` | Gym preset na `<html>`: **`LIGHT_A`** ili **`DARK_B`** (isto kao Trainify). Vrednost `TRAINIFY` u JSON-u se tretira kao „bez preset-a“. |
| **`primaryColorHex`** | `primaryColorHex=%233b82f6` | URL-enkodiran `#RRGGBB`. **Važno:** u kodu (`applyTenantTheme.ts`) prilagođena primarna boja se primenjuje **samo ako je postavljen i validan `themePreset` (`LIGHT_A` ili `DARK_B`)** — hex bez preset-a **ne menja** `--primary`. |
| **`themeFont`** | `themeFont=INTER` | Ista konvencija kao u admin modalu teme (Google font link + `--font`). |
| **`borderRadiusPx`** | `borderRadiusPx=12` | Broj 0–16 → CSS radius tokeni. |
| **`buttonHoverHex`** | `buttonHoverHex=%232563eb` | Opciono; inače se izračuna iz primarne. |

**Primer kompletnog `src` za iframe** (ilustracija; zamenite host i `tenant_id`):

```text
https://<webshop-frontend-host>/catalog?embed=true&tenantTheme=1&tenantId=TERETANA-1&lang=sr&appTheme=light&themePreset=LIGHT_A&primaryColorHex=%233b82f6&borderRadiusPx=10&themeFont=INTER
```

#### 2.3.2. `postMessage` iz Trainify roditelja

Sluša se u `installCrossAppThemeListener()` (`embedThemeBootstrap.ts`). Tip poruke:

- **`webshop-theme-handoff`** (preporučeno za WebShop), ili
- **`trainify-webshop-theme`** (alias, kompatibilnost).

Telo (pojednostavljeno):

```json
{
  "type": "webshop-theme-handoff",
  "version": 1,
  "appTheme": "light",
  "theme": {
    "tenantId": "TERETANA-1",
    "themePreset": "LIGHT_A",
    "primaryColorHex": "#3b82f6",
    "hasLogo": false,
    "logoPath": null,
    "borderRadiusPx": 12,
    "themeFont": "INTER",
    "buttonHoverHex": "#2563eb",
    "themeUpdatedAt": null
  }
}
```

`theme` odgovara `TenantThemeDto` na frontu / JSON-u koji vraća `GET /api/v1/tenant/theme` i javni `GET /api/v1/public/tenants/{tenantId}/theme`. Posle poruke tema se i **kešira** (`tenantBrandingCache`) radi sledećeg ulaska.

#### 2.3.3. Javni endpoint teme (login / embed bez tokena)

Ako iframe učitava npr. `/login?tenantId=...`, `LoginPage` dodatno zove **`GET /api/v1/public/tenants/{tenantId}/theme`** i primenjuje odgovor (logo putanja, preset, boje, …). Query brend iz §2.3.1 i dalje može da predstoji ili dopuni ovo.

#### 2.3.4. Jezik API-ja (pored UI `lang`)

Za **`fetch` direktno na WebShop API** i dalje šaljite zaglavlje **`Accept-Language: sr`** (ili `en` / `ru` / `zh`) — isto kao u §3; vrednost na frontu dolazi iz `getSavedLanguage()` (`frontend/src/api/client.ts`) nakon što je korisnik (ili URL) postavio jezik.

---

## 3. HTTP konvencije

- **Zaglavlja svakog zahteva**
  - `Authorization: Bearer <access_token>`
  - `Accept-Language: sr` (ili `en`, `ru`, `zh`) — lokalizovane greške iz API-ja.
  - Kod `POST` sa telom: `Content-Type: application/json`.

- **Greške**  
  FastAPI vraća JSON sa `detail` (string ili lista validacionih objekata). Tretirati `4xx` kao korisničku validaciju (`pickup_too_soon`, `product_unavailable`, itd.).

---

## 4. Preporučeni tok (ekran zakazivanja)

1. **Učitaj pravila checkout-a** (ograničenja termina, lokacije):  
   `GET /api/v1/tenant/order-rules`

2. **Učitaj proizvode za kontekst treninga** (filtriranje po **nazivu tipa proizvoda** u bazi — `ILIKE '%type%'`):  
   `GET /api/v1/products/for-training-type?type=šejk`  
   Parametar `type` je proizvoljan string; ako ga izostaviš, dobijaš sve dostupne proizvode tenanta. Za „samo šejkove“ tip u adminu/katalogu mora u imenu tipa sadržati traženi podstring (npr. tip „Šejk“ ili „Protein šejk“).

3. **Korisnik bira** proizvod (`product_id`), količinu, eventualno napomenu na stavci.

4. **Termin preuzimanja (`pickup`)** — uskladiti sa UX-om teretane:
   - `mode: "exact"` — tačno vreme (npr. kraj treninga); **`at` obavezno** ISO 8601.
   - `mode: "day"` — okvirni dan; `at` je i dalje datetime (često početak dana ili izabrani slot).
   - `mode: "none"` — bez zakazanog termina; `at` je `null`.

   Pravila: `pickup_at` se u odnosu na **`timezone`** iz `order-rules` poredi sa „sada“; mora biti ≥ `sada + min_notice_hours_before_pickup` i datum unutar `max_schedule_days_ahead`. Inače `400` (`pickup_too_soon` / `pickup_too_far`).  
   Ako tenant ima barem jednu **lokaciju** u pravilima, **`pickup_location_id`** je obavezan i mora biti ID aktivne lokacije iz liste.

5. **Kreiraj porudžbinu**:  
   `POST /api/v1/orders`  
   Telo: JSON kao u odeljku 5.

6. **Odgovor** sadrži m.in. `id`, `order_number`, `qr_data_url` (data URL PNG), stavke. U UI-u Trainify-a možeš:
   - prikazati QR i broj porudžbine,
   - ili otvoriti WebShop u novom tabu na stranicu detalja:  
     `https://<webshop-frontend-host>/orders/<id>`  
     (korisnik mora biti ulogovan u WebShop ako želi isti session u browseru; alternativa je samo prikaz podataka iz API odgovora u Trainify-ju).

7. **Lista „Moje porudžbine“** (opciono):  
   `GET /api/v1/orders?mine=true`

---

## 5. Šema: `POST /api/v1/orders`

### Telo zahteva (`OrderCreate`)

| Polje | Tip | Obavezno | Opis |
|-------|-----|----------|------|
| `lines` | niz | da | Min. jedna stavka: `{ "product_id": number, "quantity": number ≥ 1, "note": string }`. |
| `pickup` | objekat | da | `{ "mode": "exact" \| "day" \| "none", "at": string \| null (ISO 8601), "note": string }`. Za `exact`, `at` mora postojati. |
| `pickup_location_id` | number \| null | uslovno | Obavezno ako tenant ima lokacije; inače `null`. |
| `source_code` | string | ne | Podrazumevano `"WEBSHOP"`. Za Trainify koristiti **`"TRAINIFY"`**. |
| `external_ref` | string \| null | ne | Slobodan string za vezu (npr. `trainify:booking:12345`). Nije prikazan korisniku u MVP-u ali je koristan za podršku i debug. |
| `preferred_lang` | string | ne | Npr. `sr`, do ~8 karaktera — jezik mejla/notifikacija. |

### Primer: šejk posle treninga u 18:30 (lokalno vreme kao UTC offset u ISO)

```json
{
  "lines": [
    {
      "product_id": 42,
      "quantity": 1,
      "note": "Posle treninga sa trenerom Markom"
    }
  ],
  "pickup": {
    "mode": "exact",
    "at": "2026-04-24T16:30:00.000Z",
    "note": "Preuzimanje na recepciji"
  },
  "pickup_location_id": 1,
  "source_code": "TRAINIFY",
  "external_ref": "trainify:session:abc-uuid",
  "preferred_lang": "sr"
}
```

Napomena o vremenu: backend prihvata `at` sa ili bez zone; ako nema zone, tretira se kao UTC. Za najmanje iznenađenja, šalji **ISO 8601 sa eksplicitnom zonom** (`...+02:00` ili `Z`) usklađenu sa `timezone` iz `order-rules`.

### Uspeh

- Status **201**.
- Telo: detalj porudžbine (uključujući `qr_data_url`, `lines`, `status`, …).

---

## 6. Pomoćni endpointi

### `GET /api/v1/tenant/order-rules`

Odgovor (pojednostavljeno):

```json
{
  "max_schedule_days_ahead": 14,
  "min_notice_hours_before_pickup": 2,
  "pickup_grace_hours_after_slot": 24,
  "timezone": "Europe/Belgrade",
  "locations": [
    { "id": 1, "code": "main", "name": "Glavna recepcija", "address_line": "", "sort_order": 0, "is_active": true }
  ]
}
```

Koristi se za validaciju datuma u UI pre slanja i za obaveznu lokaciju.

### `GET /api/v1/products/for-training-type?type=<string>`

- Filtrira **dostupne** proizvode (`available === true`) tenanta iz tokena.
- Ako je `type` neprazan, ostaju proizvodi čiji **naziv tipa** (`product_type_name`) sadrži podstring (case-insensitive).

### `GET /api/v1/products`

Svi dostupni proizvodi kataloga (bez filtra tipa).

---

## 7. UX preporuke u Trainify-ju

- Prikaži cenu (`price_gross`), naziv, sliku (`image_url`) iz `ProductOut`.
- Ako nema proizvoda za dati `type`, smanji `type` ili koristi pun `/products` i ručnu kategoriju u Trainify-ju.
- Nakon uspeha, jasna poruka: plaćanje na recepciji; QR može u modalu ili deep link samo na webshop detalj.
- Greška `product_unavailable`: proizvod je u međuvremenu isključen — ponudi osvežavanje liste.

---

## 8. Alternativa bez direktnog API-ja

Ako prvi release ne može da nosi token do WebShop API-ja iz browsera:

- Dugme **„Otvori webshop“** vodi na javni URL WebShop frontenda; korisnik tamo ručno bira proizvod i termin.  
- Ovo **ne** vezuje automatski Trainify rezervaciju (`external_ref`); za punu integraciju potreban je scenario iz odeljaka 4–5 (ili backend proxy u Trainify-ju).

---

## 9. Checklista za dev timove

- [ ] Zitadel uloga `WEBSHOP_CUSTOMER` (ili ekvivalent) dodeljena istim korisnicima koji zakazuju u Trainify-ju.
- [ ] `tenant_id` u tokenu odgovara tenantu čiji se katalog koristi.
- [ ] U WebShop adminu postoje tipovi proizvoda i proizvodi (npr. „Šejk“) i `TRAINIFY` ostaje aktivan izvor u bazi.
- [ ] CORS ili backend proxy rešen za produkcioni origin Trainify-ja.
- [ ] Test: `order-rules` → `for-training-type` → `POST /orders` sa `source_code: "TRAINIFY"` i `external_ref` sa ID-jem rezervacije.
- [ ] **Iframe tema:** ako koristite `primaryColorHex`, uvek prosledite i **`themePreset=LIGHT_A` ili `DARK_B`** (inače se primarna ne primenjuje).
- [ ] **Iframe jezik:** `lang` / `locale` u URL-u ili korisnikov prethodni izbor u `webshop_lang`; API `Accept-Language` usklađen.
- [ ] Po potrebi: `postMessage` sa `webshop-theme-handoff` testiran iz Trainify konzole (origin / sandbox).

---

*Verzija dokumenta: WebShop backend šeme (`OrderCreate`, `PickupIn`, `TenantOrderRulesOut`), rute `/api/v1`, plus front bootstrap teme/jezika (`main.tsx`, `theme/embedThemeBootstrap.ts`, `theme/applyTenantTheme.ts`).*
