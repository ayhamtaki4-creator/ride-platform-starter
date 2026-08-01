# تطبيق Milestone 1 على المستودع الحالي

## الطريقة الأسهل

انسخ جميع ملفات هذا المجلد فوق ملفات مشروعك مع الموافقة على الاستبدال.

بعدها من جذر المشروع:

```powershell
git rm docker-compose.yml.bak -ErrorAction SilentlyContinue
git rm apps/api/*.tsbuildinfo -ErrorAction SilentlyContinue

Copy-Item .env.example .env -Force
Copy-Item .env apps\api\.env -Force
"NEXT_PUBLIC_API_URL=http://localhost:4000/api" |
  Set-Content apps\portal\.env.local -Encoding ascii

docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm dev
```

عندما يطلب Prisma اسم Migration اكتب:

```text
milestone_1
```

## رفع التحديث إلى GitHub

```powershell
git add .
git commit -m "Implement secure trip flow milestone 1"
git push
```
