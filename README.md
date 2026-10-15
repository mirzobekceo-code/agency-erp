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

Demo kirish: `admin` / `admin12345`. Xodimlar: `aziz` (menejer), `malika`, `jasur`, `dilnoza` (mutaxassis), `nodira` (buxgalter), paroli `demo12345`.

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

## Production

1. `backend/.env.example` faylidan `backend/.env` yarating, `SECRET_KEY`, `DEBUG=0` va PostgreSQL ma'lumotlarini kiriting.
2. `pip install gunicorn && gunicorn config.wsgi` bilan backendni ishga tushiring.
3. `cd frontend && npm run build` — `dist/` papkasini nginx orqali tarqating, `/api/` va `/media/` ni backendga proxy qiling.
4. `python manage.py collectstatic` — Django admin statik fayllari uchun.

## API

Barcha endpointlar `/api/` ostida, JWT (`Authorization: Bearer <token>`) bilan himoyalangan.

- `POST /api/auth/login/`, `POST /api/auth/refresh/`, `GET /api/auth/me/`
- `users`, `clients`, `leads` (+ `POST leads/{id}/convert/`), `contracts`, `projects`, `tasks`, `task-comments`, `time-entries`, `invoices`, `payments`, `expenses`, `ad-spends`, `posts`
- `GET /api/reports/dashboard/`, `GET /api/reports/finance/?from=&to=`, `GET /api/reports/projects/{id}/?from=&to=`

Ro'yxatlar `?search=`, `?ordering=`, `?page=`, `?page_size=` va maydon filtrlari bilan ishlaydi.
