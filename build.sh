#!/usr/bin/env bash
# Render (yoki boshqa server) uchun build: frontend'ni yig'adi, backend'ni tayyorlaydi.
set -o errexit

cd frontend
npm ci
npm run build
cd ../backend

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py ensure_admin
if [ "$SEED_DEMO" = "1" ]; then
  python manage.py seed_demo
fi
