# Agentlik ERP

Marketing agentligi uchun ERP tizimi: mijozlar, loyihalar, vazifalar, kontent-reja, moliya va hisobotlar.

**Texnologiyalar:** Django 6 + Django REST Framework (backend), React 19 + TypeScript + Vite (frontend), PostgreSQL / SQLite.

## Modullar

| Bo'lim | Imkoniyatlar |
|---|---|
| **Mijozlar** | Lidlar voronkasi (manba, bosqich, kutilayotgan summa, bir tugma bilan mijozga aylantirish), mijozlar bazasi, shartnomalar (fayl yuklash bilan) |
| **Ish jarayoni** | Loyihalar (xizmat turi, byudjet, jamoa), Kanban vazifalar doskasi (drag & drop), vazifa izohlari, ish vaqtini hisobga olish |
| **Kontent-reja** | Oylik SMM kalendar: platforma, tur, holat (g'oya → tasdiq → e'lon), qamrov va faollik |
| **Moliya** | Hisob-fakturalar (raqam avtomatik), qisman va to'liq to'lovlar (holat avtomatik yangilanadi, ortiqcha to'lov bloklanadi), xarajatlar, maosh, reklama sarflari (CTR, lid narxi) |
| **Hisobotlar** | Dashboard, mijoz uchun loyiha hisoboti (chop etish / PDF), davr bo'yicha moliyaviy hisobot |
| **Xodimlar** | Rollar: Administrator, Loyiha menejeri, Mutaxassis, Buxgalter |

### Rollar va huquqlar

| | Admin | Menejer | Buxgalter | Mutaxassis |
|---|---|---|---|---|
| Mijoz / lid / loyiha yaratish | ✅ | ✅ | ko'radi | ko'radi |
| Vazifa va kontent | ✅ | ✅ | ✅ | ✅ |
| Moliya | ✅ | ko'radi (+ reklama sarfi kiritadi) | ✅ | ❌ |
| Xodimlarni boshqarish | ✅ | ko'radi | ko'radi | ko'radi |
| Maoshlarni ko'rish | ✅ | faqat o'zini | ✅ | faqat o'zini |

## Ishga tushirish (lokal)

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo        # ixtiyoriy: demo ma'lumotlar
python manage.py runserver        # http://127.0.0.1:8000
```

Demo kirish (faqat lokal): `admin` / `admin12345`. Xodimlar: `aziz` (menejer), `malika`, `jasur`, `dilnoza` (mutaxassis), `nodira` (buxgalter), paroli `demo12345`.

Django admin paneli: http://127.0.0.1:8000/admin/

### Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Vite `/api` so'rovlarini avtomatik ravishda `127.0.0.1:8000` ga yo'naltiradi.

### Testlar

```bash
cd backend && python manage.py test tests
```

## Bepul serverga joylashtirish (Render + Neon)

Backend va frontend bitta Render xizmatida ishlaydi, ma'lumotlar bazasi Neon'da (bepul PostgreSQL).

1. **Neon**: https://neon.tech da ro'yxatdan o'ting, yangi loyiha yarating (region: Frankfurt) va **Connection string** ni nusxalang (`postgresql://...`).
2. **Render**: https://render.com ga GitHub orqali kiring → **New → Blueprint** → `agency-erp` repozitoriyasini tanlang. `render.yaml` avtomatik o'qiladi.
3. So'ralgan qiymatlarni kiriting:
   - `DATABASE_URL` — Neon connection string
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD` — tizimga kirish uchun administrator (kuchli parol!)
   - `DEMO_PASSWORD` — faqat `SEED_DEMO=1` bo'lsa demo xodimlar paroli; aks holda bo'sh qoldiring
4. **Apply** ni bosing. Build 3–5 daqiqa davom etadi, keyin `https://agency-erp-xxxx.onrender.com` havolasi ishlaydi.

Har safar `main` ga push qilinganda Render avtomatik qayta joylashtiradi (migratsiyalar ham avtomatik).

**Bepul tarif cheklovlari:**
- 15 daqiqa hech kim kirmasa server "uxlaydi", keyingi kirishda ~1 daqiqa uyg'onadi.
- Yuklangan fayllar (shartnomalar) qayta joylashtirishda o'chadi — doimiy saqlash uchun pullik disk yoki S3/Cloudflare R2 kerak.
- Neon: 0.5 GB ma'lumot — kichik agentlik uchun yillarga yetadi.

Jamoa faol ishlata boshlaganda Render Starter ($7/oy) ga o'tish tavsiya etiladi.

### Boshqa server (VPS)

`build.sh` ni ishga tushiring, so'ng `cd backend && gunicorn config.wsgi`. Muhit o'zgaruvchilari: `DEBUG=0`, `SECRET_KEY`, `ALLOWED_HOSTS`, `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. Django frontend'ni (`frontend/dist`) o'zi beradi.

## API

Barcha endpointlar `/api/` ostida, JWT (`Authorization: Bearer <token>`) bilan himoyalangan.

- `POST /api/auth/login/`, `POST /api/auth/refresh/`, `GET /api/auth/me/`
- `users`, `clients`, `leads` (+ `POST leads/{id}/convert/`), `contracts`, `projects`, `tasks`, `task-comments`, `time-entries`, `invoices`, `payments`, `expenses`, `ad-spends`, `posts`
- `GET /api/reports/dashboard/`, `GET /api/reports/finance/?from=&to=`, `GET /api/reports/projects/{id}/?from=&to=`

Ro'yxatlar `?search=`, `?ordering=`, `?page=`, `?page_size=` va maydon filtrlari bilan ishlaydi.
