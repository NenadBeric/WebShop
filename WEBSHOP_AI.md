# WebShop — AI funkcionalnost (specifikacija za implementaciju)

Ovaj dokument nadovezuje se na **`DEVELOPER_HANDOFF.md`** (Python / FastAPI / React kao Trainify) i **`WebShop.md`** (MVP katalog i porudžbine). **AI nije obavezno u prvom isporučenom MVP jezgru** — ovo je plan i tehnički okvir za iteracije posle stabilnog osnovnog proizvoda.

**Jezik odgovora:** AI endpointi moraju poštovati isti jezik kao ostatak aplikacije — **`Accept-Language`** / korisnički sačuvan jezik (`webshop_lang`, vidi **`DEVELOPER_HANDOFF.md` §2.3** i **`WebShop.md` §2.8**). Odgovori modela u istom jeziku kao zahtev (sr/en/ru/zh).

---

## 1. Ciljevi AI sloja

- Pomoć korisnicima da **brže pronađu i odaberu** proizvode (pretraga, preporuke, objašnjenja).
- Pomoć osoblju da **brže obradi** narudžbine i pripremu (rezimei, checkliste, upozorenja — bez zamene ljudske odluke gde spec zahteva ručni korak).
- Jedan **isti tehnološki stek** kao Trainify (`LLM_*` u konfiguraciji, LangChain ili ekvivalent, opciono Langfuse).

**Ograničenja (nelogički):** AI ne menja cene, ne potvrđuje plaćanje, ne menja status narudžbine bez eksplicitnog ljudskog klika gde `WebShop.md` to zahteva. AI je **asistent**, ne autoritet.

---

## 2. Šta AI može da ponudi — po ulozi

Uloge su kao u **`DEVELOPER_HANDOFF.md`** §5 (`WEBSHOP_*`, plus globalni `ADMIN`). Predlogi ispod su modularni: svaka stavka može biti poseban endpoint, widget ili pozadinski job.

### 2.1. `WEBSHOP_CUSTOMER` (kupac)

| Mogućnost | Opis | Prioritet (smernica) |
|-----------|------|----------------------|
| **Prirodnojezička pretraga** | Korisnik piše „nešto za oporavak posle treninga“ → sistem mapira na relevantne proizvode iz kataloga (tenant-scoped), uz klasične filtere. | Visok |
| **Predlog iz korpe** | „Ljudi koji su kupili X često uzmu Y“ (collaborative / content-based; LLM samo za tekstualni obmotaj, ne za izmišljanje proizvoda van kataloga). | Srednji |
| **Asistent u korpi** | Kratko pitanje: „Da li ovo ide uz šejk posle treninga?“ — odgovor **samo** na osnovu opisa proizvoda u bazi + javno dostupnih smernica (bez medicinskih dijagnoza). | Srednji |
| **Sažetak proizvoda** | Skraćivanje dugog opisa u 2–3 rečenice (readability). | Nizak |
| **Pomoć pri terminu preuzimanja** | Predlog tipa preuzimanja (tačno / okvirno) na osnovu tipa proizvoda (npr. šejk → tačniji termin) — pravilo + optional LLM copy. | Nizak |

**Bezbednost:** prompt mora uvek uključivati **samo** proizvode iz `tenant_id` korisnika; nikakvi podaci drugih tenanata.

---

### 2.2. `WEBSHOP_RECEPTION` (recepcija + kuhinja, jedna uloga)

| Mogućnost | Opis | Prioritet |
|-----------|------|-----------|
| **Rezime narudžbine** | Jedan prikaz: šta pripremiti, za kada, alergeni/napomene ako su u poljima (samo ako postoje u bazi). | Visok |
| **Dnevni radni niz** | „Šta sve treba pripremiti u narednih X sati“ agregat iz otvorenih narudžbina — generisan tekst + linkovi na narudžbine (izvor istine = DB). | Visok |
| **Predlog odgovora klijentu** | Šablon teksta za mejl/SMS uz zamenu proizvoda (čovek odobri pre slanja). | Srednji |
| **Provera konzistentnosti** | Upozorenje: „Stavka 3 je označena kao nedostupna u katalogu“ — heuristika iz baze, LLM opciono za formulaciju. | Srednji |
| **Glasovna / brza pretraga narudžbine** | (Opciono kasnije) Pretraga po broju / imenu — NL → SQL filter pomoću striktnog tool-a, ne slobodan SQL od modela. | Nizak |

**Kritično:** ne automatski menjati status narudžbine; AI samo predlaže tekst ili listu.

---

### 2.3. `WEBSHOP_MANAGER`

| Mogućnost | Opis | Prioritet |
|-----------|------|-----------|
| **Insight prodaje (tekstualni)** | Za dati period: sažetak trendova iz **već agregiranih** podataka (SQL → brojevi → LLM piše paragraf). Model ne „nagađa“ brojke van agregata. | Srednji |
| **Pomoć pri CSV mapiranju** | Korisnik zakači CSV zaglavlje → predlog koji stupac je naziv / cena / dostupnost (čovek potvrdi). | Srednji |
| **SEO / opis kataloga** | Predlog kratkog marketing teksta za proizvod iz činjenica u bazi (opciono, etički ograničeno). | Nizak |
| **Detekcija duplikata** | Embedding sličnost naziva između proizvoda istog tenanta — lista kandidata za ručni pregled. | Nizak |

---

### 2.4. `WEBSHOP_OWNER`

| Mogućnost | Opis | Prioritet |
|-----------|------|-----------|
| **Executive summary** | Mesečni tekstualni rezime iz metrika (isti princip kao za menadžera, širi horizont). | Nizak |
| **Uporedni opis planova** | Ako postoje „paketi“ ili cenovne grupe u budućnosti — neutralno objašnjenje razlika (samo ako postoje u podacima). | Po potrebi |

---

### 2.5. `ADMIN` (globalno održavanje)

| Mogućnost | Opis | Prioritet |
|-----------|------|-----------|
| **Diagnostički asistent** | Pomoć pri čitanju logova / grešaka (uneti odlomak loga → predlog uzroka) — **ne** sa produkcijskim tajnama u promptu. | Nizak |
| **Dokumentacija u kodu** | Generisanje kratkog README za interni endpoint (dev only). | Nizak |

**Ograničenje:** admin AI alatki držati iza posebnog feature flag-a i IP restrikcije ako treba.

---

### 2.6. Korisnik autentifikovan preko Trainify integracije (`TRAINIFY` izvor narudžbine)

Korisnik u praksi često ima ulogu **`CLIENT`** u Trainify-ju; na WebShop katalogu kao **`WEBSHOP_CUSTOMER`** (ili samo JWT sa kupovinom dozvoljenom).

| Mogućnost | Opis |
|-----------|------|
| **Kontekst treninga (opciono, Faza 2+)** | Ako Trainify po API-ju proslijedi **neosjetljiv** kontekst (npr. tip treninga, vrijeme termina bez zdravstvenih podataka), AI može predložiti proizvode usklađene s tim kontekstom — isključivo iz WebShop kataloga. |
| **Jedan tok „poslije treninga“** | Tekstualni vodič + lista već odabranih proizvoda — smanjuje trenje u integrisanom booking + order toku. |

**Privatnost:** dogovoriti minimalni skup polja koji Trainify smije da proslijedi WebShop AI ruti; bez PII u LLM ako nije neophodno.

---

## 3. Tehnički okvir (usklađenje sa Trainify-jem)

- **Backend:** Python FastAPI; konfiguracija kao `Trainify-v2/backend/app/config.py` (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, opciono `LANGFUSE_*`).
- **Biblioteke:** kao u Trainify `requirements.txt` (`langchain`, `langchain-openai`, …) — verzije uskladiti sa Trainify-jem da tim ne drži dva svijeta.
- **Promptovi:** YAML ili registry (pattern iz Trainify `app/prompts/`, `app/services/ai/`).
- **Rute (predlog imenovanja):** npr. `POST /api/v1/ai/search`, `POST /api/v1/ai/suggest-cart`, `POST /api/v1/ai/staff/order-summary` — sve zaštićene RBAC-om kao ostatak API-ja.
- **Rate limiting:** obavezno (npr. `slowapi` kao Trainify); per-user i per-tenant kvote.
- **Tenant:** svaki upit uključuje `tenant_id` iz JWT; retrieval samo iz tog tenanta.

---

## 4. Bezbednost i usklađenost

- **Retrieval-augmented:** odgovori o proizvodima moraju biti temeljeni na **stvarnim redovima iz baze** (RAG nad opisima/nazivima), ne na „pamćenju“ modela.
- **Zdravlje / suplementi:** izbjegavati medicinske tvrdnje; sistemski prompt + moderacija (opciono drugi prolaz „safety judge“ kao u Trainify obrascima ako postoji).
- **Audit:** logovati `user_id` / `sub`, `tenant_id`, tip akcije, hash prompta ili template id (bez punog sadržaja ako je rizično); Langfuse trace po želji.
- **PII:** minimizovati lične podatke u promptu; za recepciju koristiti inicijale ili broj narudžbine gdje je dovoljno.

---

## 5. Faze isporuke (predlog)

| Faza | Sadržaj |
|------|---------|
| **A0** | Infrastruktura: env (`LLM_*` kao Trainify), klijent, healthcheck ruta; AI aktivan kada je `LLM_API_KEY` podešen. |
| **A1** | NL pretraga kataloga za `WEBSHOP_CUSTOMER` (tenant-scoped retrieval). |
| **A2** | Rezime narudžbine + dnevni agregat za `WEBSHOP_RECEPTION`. |
| **A3** | Predlozi u korpi + kratki Q&A o proizvodima (strogi RAG). |
| **A4** | Manager insights + CSV mapiranje pomoć. |
| **A5** | Integracija konteksta iz Trainify (samo uz eksplicitan API ugovor i privolu). |

Redosled A1–A5 može da se permutuje po product prioritetu.

---

## 6. Veza sa ostalim dokumentima

- **`DEVELOPER_HANDOFF.md`** §2.2, §9 Faza 3 — visok nivo.
- **`WebShop.md`** — funkcionalni MVP bez AI; AI ne mijenja statuse i QR logiku.

---

## 7. Otvorena pitanja za product (popuniti prije A5)

- [ ] Da li kupac smije da vidi AI odgovor ako proizvod nije dostupan (samo informativno)?
- [ ] Jezici odgovora: **usklađeno sa MVP lokalizacijom** — `sr` / `en` / `ru` / `zh` (isti header / storage kao Trainify; vidi `DEVELOPER_HANDOFF.md` §2.3).
- [ ] Budžet po tenantu za LLM tokene (opciono)?

---

*Kraj dokumenta.*
