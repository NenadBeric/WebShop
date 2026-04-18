# Specifikacija: Nezavisni webshop za teretanu (MVP)

## 1. Kontekst

Trenutno imamo:
- **Staru aplikaciju** (Aplikacija A) – za zakazivanje termina treninga, unos planova, praćenje napretka klijenata. Njena interna struktura nije u potpunosti poznata (razvija je drugi tim ili je nasleđena).
- **Žitadel** – centralni identitet provajder za sve aplikacije (korisnici, role, sesije).

**Cilj:** Napraviti **novu, nezavisnu aplikaciju** (Aplikacija B) – mali webshop za poručivanje proizvoda (suplementi, šejkovi, itd.). Ova aplikacija treba da bude **multitenant** (može se prodati drugim teretanama), da ne vodi sopstvenu bazu korisnika (oslanja se na Žitadel), i da nema online plaćanje u MVP-u. Takođe, treba da se integriše sa Aplikacijom A na nekoliko tačaka.

## 2. Aplikacija B – funkcionalni zahtevi (MVP)

### 2.1. Katalog proizvoda
- Svaki proizvod ima: **naziv, cenu, opis, sliku** (obavezno), **tip** (npr. suplement, šejk, oprema).
- **Ručni prekidač dostupnosti** (`dostupan = true/false`). Ako je `false`, proizvod se **ne prikazuje** klijentima u katalogu (potpuno sakriven). Nema automatskog praćenja stanja lagera – zaposleni ručno uključuje/isključuje dostupnost po potrebi.
- **Zamenski proizvodi** – za svaki proizvod može se definisati 1–3 alternativna proizvoda (ID-ovi). Koriste se prilikom procesa zamene (vidi 2.5).
- **Uvoz/izvoz proizvoda** putem CSV/Excel fajla. Omogućiti:
  - masovni uvoz novih proizvoda,
  - ažuriranje postojećih (cijena, dostupnost, slika URL, zamene),
  - brisanje (ili deaktiviranje) proizvoda.

### 2.2. Naručivanje (bez online plaćanja)
Klijent (član ili gost) može da naruči **samo proizvode koji su trenutno dostupni** (prekidač = true).

Korpa:
- Za svaku stavku klijent može odabrati:
  - **Tačan termin preuzimanja** (npr. 24.4.2026. u 18:00) – posebno za šejkove ili proizvode koji se pripremaju.
  - **Okvirni dan** (npr. "doći ću 24.4. poslije podne").
  - **Bez termina** ("preuzimam kad stignem").

Na kraju narudžbine:
- Nema online plaćanja. Prikazuje se poruka: *"Platite na recepciji prilikom preuzimanja."*
- Generiše se **broj narudžbine** i **QR kod**.
- Klijent dobija podatke na ekranu + mejlom (i/ili SMS, ali SMS je opcionalan za MVP).
- Status narudžbine: `Čeka potvrdu`.

### 2.3. Statusi narudžbine
1. `Čeka potvrdu` – tek stigla, niko nije reagovao.
2. `Delimično dostupno – čeka zamenu` – neke stavke su nedostupne (zaposleni je pokrenuo zamenu).
3. `Spremno za preuzimanje` – sve stavke odobrene/zamenjene.
4. `Preuzeto` – klijent platio i uzeo.
5. `Odbijeno` – narudžba ne može biti ispunjena (razlog se beleži).
6. `Isteklo` – nije preuzeto u roku (podesivo, npr. 48h za suplemente, 2h za šejkove).

### 2.4. Recepcijski panel (zaposleni)
Pristup preko Žitadela – rola `recepcionar` ili `menadžer`.

Prikaz svih narudžbina (tabela sa filterima po statusu, datumu). Za svaku narudžbinu:
- Detaljni prikaz stavki. Pored svake stavke indikator **dostupnosti u trenutku obrade** (zeleno/crveno). Crveno = proizvod je u međuvremenu postao nedostupan.
- **Akcije:**
  - `Odobri celu` – ako su sve stavke zelene → status `Spremno`.
  - `Odbij celu` – status `Odbijeno` (sa razlogom).
  - `Predloži zamenu` – samo za crvene stavke. Otvara se lista unapred definisanih zamenskih proizvoda (iz kataloga). Zaposleni bira jedan (ili više) i šalje ponudu klijentu. Klijent odgovara (prihvata jednu zamenu ili odbija). Nakon prihvatanja, stavka se automatski zamjenjuje (novi proizvod se upisuje) i ponovo provjerava dostupnost. Kada sve stavke postanu zelene, zaposleni ručno klikne `Spremno`.
- **Preuzimanje:** Skeniranjem QR koda (ili ručnim unosom broja narudžbe) otvara se naplata. Zaposleni unosi iznos (može biti i djelimično plaćanje? Za MVP – pun iznos), potvrđuje i klikne `Preuzeto`. Time se narudžba zatvara.

### 2.5. Notifikacije za osoblje (priprema šejkova i sl.)
- Podesivo vrijeme unaprijed (npr. 10 minuta) prije **tačnog termina** preuzimanja – stiže notifikacija na ekran recepcije/telefon (Firebase / Telegram bot). Sadržaj: `Spremi [proizvod] za [klijent] u [termin]`.
- Za narudžbe sa okvirnim danom – notifikacija ujutro tog dana: `Pripremi [listu proizvoda] za preuzimanje danas`.
- Notifikacije se šalju **svim zaposlenima koji imaju ulogu `kitchen` ili `reception`** (podesivo u admin panelu).

### 2.6. Autentifikacija i višekorisnički rad (multitenant)
- **Žitadel** – jedini izvor identiteta. Aplikacija B ne čuva sopstvene korisnike (nema tabele `users`). Svaki zahtjev koji dolazi od klijenta ili zaposlenog mora sadržavati JWT token iz Žitadela.
- **Multitenant** – jedna instanca aplikacije B može služiti više teretana (tenanata). Svaki tenant ima:
  - svoj katalog proizvoda,
  - svoje zaposlene (role se dodeljuju u Žitadelu, npr. `teretana1_recepcionar`),
  - svoje narudžbe.
- Identifikacija tenanta: iz JWT tokena (claim `tenant_id`) ili iz domena (ako svaki tenant ima svoj poddomen, npr. `teretana1.webshop.com`). Preporuka: poddomeni radi jednostavnosti.

### 2.7. Baza podataka
- Kod nas (na serveru teretane). Aplikacija B vodi sopstvenu bazu (npr. PostgreSQL) sa tabelama:
  - `proizvodi` (tenant_id, naziv, cijena, opis, slika_url, dostupan, zamjenski_proizvodi_ids, ...)
  - `narudzbe` (tenant_id, broj, klijent_zitadel_id, status, ukupno, datum_kreiranja, termin_preuzimanja, ...)
  - `stavke_narudzbe` (narudzba_id, proizvod_id, kolicina, originalni_proizvod_id, zamjenski_proizvod_id, ...)
  - `zamjenske_ponude` (narudzba_id, stavka_id, ponudjeni_proizvodi_ids, odabrani_proizvod_id, ...)

### 2.8. Višejezičnost (lokalizacija) — **MVP**
- Ista filozofija i tehnologija kao u aplikaciji **Trainify** (detalji implementacije: **`DEVELOPER_HANDOFF.md`**, odjeljak o lokalizaciji).
- **Jezici u MVP-u:** `sr`, `en`, `ru`, `zh` — usklađeno sa Trainify-jem.
- **Frontend:** prevod svih korisničkih stringova (katalog UI, korpa, checkout, recepcijski panel, statusi narudžbine, greške iz API-ja, forma za jezik u profilu ili headeru); perzistencija izbora jezika u `localStorage` (analogno `trainify_lang`); opciono učitavanje prevoda sa istog tipa servisa kao `@lokalizacija/client` + lokalni JSON fallback (vidi Trainify `src/i18n/`).
- **Backend:** korisnički jezik iz HTTP zaglavlja **`Accept-Language`** (šalje ga frontend kao u Trainify `api/client.ts`); katalog serverskih poruka (`detail` grešaka, validacije) na istim jezicima (analogno `app/i18n/messages.py` + middleware).
- **Mejlovi / notifikacije (MVP):** šabloni ili generisani tekstovi u jeziku koji odgovara korisnikovom izboru (ili `Accept-Language`) u trenutku akcije.
- **Sadržaj proizvoda** (`naziv`, `opis` u bazi): u MVP-u može ostati **jedan jezik po unosu tenanta** (često sr); kompletan prevod samog kataloga (više redova po proizvodu) može biti **Faza 1.1** ako product zahteva — ali **UI mora biti potpuno višejezičan** od prvog isporučivog MVP-a.

## 3. Integracija sa Starom aplikacijom (Aplikacija A)

Aplikacija A je **nepoznate strukture** – developer treba da analizira njene mogućnosti (API, ekstenzije, iframe podrška). U nastavku su **principi i primjeri** kako bi integracija trebala da funkcioniše. Developer mora prilagoditi tačan mehanizam.

### 3.1. Ponuda proizvoda prilikom zakazivanja personalnog treninga
**Cilj:** Kada korisnik u Aplikaciji A bira termin za personalni trening, prije potvrde treninga prikazati mu opciju da naruči proizvod (npr. proteinski šejk) koji će biti spreman nakon treninga.

**Primjer toka (API pozivi iz Aplikacije A ka Aplikaciji B):**
1. Aplikacija A poziva `GET /api/v1/products/for-training-type?type=personalni&tenant_id=...` (sa JWT korisnika). Aplikacija B vraća listu proizvoda (ID, naziv, cijena, slika) koji su unaprijed mapirani za taj tip treninga (mapiranje se definiše u admin panelu B).
2. Aplikacija A prikaže korisniku ponudu (npr. modal).
3. Ako korisnik odabere proizvod(i) i potvrdi, Aplikacija A poziva `POST /api/v1/orders` sa podacima:
   ```json
   {
     "tenant_id": "xxx",
     "korisnik_zitadel_id": "uuid",
     "termin": "2026-04-24T18:00:00",
     "stavke": [
       { "proizvod_id": 123, "kolicina": 1, "napomena": "poslije treninga" }
     ]
   }```
Aplikacija B kreira narudžbu sa statusom Čeka potvrdu i vraća order_id i QR kod.

Aplikacija A prikazuje potvrdu korisniku.

Napomena: Ako Aplikacija A nema mogućnost da poziva REST API, može se koristiti preusmjeravanje na poseban URL u Aplikaciji B sa parametrima (npr. /order/create?training_id=...), ali API je fleksibilniji.

3.2. Dugme "Obrada porudžbine" u Aplikaciji A
U Aplikaciji A, na mjestu gdje se prikazuje trening ili klijent, dodati dugme/link Obrada porudžbine (ako postoji aktivna narudžba vezana za taj trening).

Klik otvara stranicu u Aplikaciji B (u istom tabu ili novom) – npr. https://webshop.teretana.com/orders/{order_id}.

Korisnik (zaposleni) već treba da bude autentifikovan preko Žitadela (SSO) kako ne bi tražilo ponovno logovanje.

3.3. Izvještaji – prikaz podataka iz Aplikacije B unutar Aplikacije A
Aplikacija A može u svom interfejsu imati iframe koji učitava stranicu iz Aplikacije B:
https://webshop.teretana.com/reports/embedded?member_id=...&tenant_id=...

Aplikacija B mora podržavati embed način rada (parametar ?embed=true sakriva header/menu).

Takođe, Aplikacija B može izložiti API za izvještaje (npr. GET /api/v1/reports/sales-by-member?member_id=...) koji Aplikacija A poziva i prikazuje u svojim tabelama.

Preporuka: Za MVP dovoljan je iframe – jednostavnije za implementaciju.

4. Ne-funkcionalni zahtjevi
Višejezičnost: Poglavlje **2.8**; tehnički obrazac kao Trainify (`DEVELOPER_HANDOFF.md`).

Sigurnost: Svi API pozivi između aplikacija moraju biti zaštićeni JWT tokenima (Žitadel). Aplikacija B ne smije dozvoliti pristup bez validnog tokena.

Performanse: Baza treba da podnese do 1000 narudžbi dnevno po tenantu (lako postiže i više).

Hosting: Aplikacija B se pokreće na našem serveru (ili cloud) kao kontejner (Docker). Obavezno podržavati HTTPS.

Održavanje: Omogućiti jednostavnu nadogradnju (migracije baze).

5. Šta nije u MVP (za kasnije verzije)
Automatsko praćenje stvarnog stanja na lageru (ostaje ručni prekidač).

Online plaćanje (kartice, Paypal).

Više od 3 zamenska proizvoda.

SMS notifikacije (osim ako se lako doda – može preko Twilio, ali nije obavezno).

Složeni dashboard sa grafovima (osnovni CSV izvoz je dovoljan).

Mobilna aplikacija (web je dovoljan).

6. Upute za developera
Prvi korak: Analizirati postojeću Aplikaciju A – koje API-je ima, da li podržava iframe, kako se autentifikuje preko Žitadela (isti tenant). Dogovoriti sa timom koji održava Aplikaciju A o potrebnim izmjenama (dodavanje poziva, dugmadi, iframe-a).

Arhitektura Aplikacije B: **Python (FastAPI) + PostgreSQL**, u istom tehnološkom skupu kao aplikacija Trainify (SQLAlchemy async, Alembic, Pydantic, Uvicorn). Detalji i redosled faza: **`DEVELOPER_HANDOFF.md`**.

Žitadel integracija: Implementirati middleware koji provjerava JWT i izvlači tenant_id i user_id. Omogućiti role (u implementaciji koristiti dogovorene Zitadel ključeve iz `DEVELOPER_HANDOFF.md`).

CSV import: Python biblioteke (npr. `pandas` ili `csv` + `openpyxl` za Excel). Podržati UTF-8.

Lokalizacija: obavezno u MVP (poglavlje **2.8**); isti stack kao Trainify (`src/i18n`, `@lokalizacija/client`, backend `I18nMiddleware` + `tr()`).

Planirano proširenje: **AI** (predlog proizvoda, pomoć pri odabiru, napredna pretraga) u istom Python/LangChain ekosistemu kao u Trainify backendu — nakon ili paralelno sa MVP jezgrom, po backlog-u.

QR kod: Generisati pomoću qrcode biblioteke (kao data URL ili PNG). Poslati u mejlu.

Notifikacije: Za MVP – slati mejlove (SMTP) i/ili koristiti Telegram bot (jednostavno). Push notifikacije (Firebase) mogu kasnije.

7. Primjer API specifikacije (minimalna)
Endpoint	Metoda	Opis	Auth
/api/v1/products	GET	Lista dostupnih proizvoda (za katalog)	JWT (klijent)
/api/v1/products/for-training-type	GET	Vraća proizvode za dati tip treninga	JWT (klijent)
/api/v1/orders	POST	Kreira narudžbu	JWT (klijent)
/api/v1/orders/{id}	GET	Detalji narudžbe (za klijenta ili zaposlenog)	JWT
/api/v1/orders/{id}/status	PUT	Promjena statusa (odobri, odbij, spremno, preuzeto)	JWT (recepcionar)
/api/v1/orders/{id}/substitution	POST	Predlaže zamjenu za stavku	JWT (recepcionar)
/api/v1/orders/{id}/substitution/response	PUT	Klijent odgovara na ponudu zamjene	JWT (klijent)
/api/v1/reports/sales	GET	Izvještaji (CSV/JSON)	JWT (menadžer)
/api/v1/import/products	POST	CSV import proizvoda	JWT (menadžer)
8. Zaključak
Aplikacija B treba da bude samostalna, ali i dobro povezana sa Aplikacijom A kroz API pozive i iframe. Prioritet je funkcionalnost webshopa bez online plaćanja i bez složenog upravljanja lagerom. Nakon što MVP zaživi, možemo dodavati napredne opcije.