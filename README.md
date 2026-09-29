# PTT License Admin

سامانه مدیریت فعال‌سازی اپ **Personal Time Tracker** برای دیپلوی روی **Vercel**.

## امکانات

- صدور کد فعال‌سازی یک‌بارمصرف (یا چند دستگاه)
- ثبت مشخصات گوشی و نام کاربری هنگام فعال‌سازی
- غیرفعال‌سازی کاربر/دستگاه از پنل
- بررسی آنلاین وضعیت لایسنس هنگام ورود به اپ
- رابط مدیریت ساده و فارسی
- دیپلوی خودکار با هر push به GitHub (Vercel)

## API اپ موبایل

### فعال‌سازی
```http
POST https://YOUR-DOMAIN/api/v1/activate
Content-Type: application/json

{
  "code": "PTT-XXXX-XXXX",
  "deviceId": "unique-android-id",
  "deviceModel": "Pixel 7",
  "deviceBrand": "Google",
  "androidVersion": "14",
  "appVersion": "1.2.0",
  "username": "o.parishani"
}
```

پاسخ موفق:
```json
{ "ok": true, "licenseKey": "LIC-...", "message": "فعال‌سازی موفق" }
```

### بررسی اعتبار (هر بار باز شدن اپ)
```http
POST https://YOUR-DOMAIN/api/v1/validate
Content-Type: application/json

{
  "licenseKey": "LIC-...",
  "deviceId": "unique-android-id",
  "username": "o.parishani",
  "appVersion": "1.2.0"
}
```

```json
{ "ok": true, "active": true }
```
یا
```json
{ "ok": true, "active": false, "reason": "disabled", "message": "..." }
```

## راه‌اندازی روی Vercel

### ۱) دیتابیس Postgres
یکی از این‌ها:
- [Neon](https://neon.tech) (رایگان)
- Vercel Storage → Postgres
- Supabase

`DATABASE_URL` را کپی کنید.

### ۲) پروژه GitHub
```bash
cd ptt-license
git init
git add .
git commit -m "init PTT license admin"
# ریپو را در GitHub بسازید و push کنید
```

### ۳) اتصال به Vercel
1. [vercel.com](https://vercel.com) → Add New Project → Import از GitHub
2. Framework: Next.js (خودکار)
3. Environment Variables:

| Name | Value |
|------|--------|
| `DATABASE_URL` | connection string پستگرس |
| `ADMIN_PASSWORD` | رمز ورود پنل شما |
| `JWT_SECRET` | یک رشته تصادفی بلند |

4. Deploy

### ۴) ساخت جداول
بعد از اولین دیپلوی، در Vercel → Project → Settings یا لوکال:

```bash
npx prisma db push
```

یا در Vercel با یک بار اجرای:
```
npx prisma db push
```
از طریق SSH/CLI یا افزودن به `build` (اگر دیتابیس آماده باشد).

پیشنهاد: لوکال با `DATABASE_URL` واقعی:
```bash
npm i
npx prisma db push
```

### ۵) ورود به پنل
`https://YOUR-PROJECT.vercel.app/login`  
رمز = همان `ADMIN_PASSWORD`

## دیپلوی خودکار
با اتصال ریپوی GitHub به Vercel، هر `git push` روی branch اصلی باعث Build و Deploy خودکار می‌شود.

## توسعه لوکال
```bash
cp .env.example .env
# DATABASE_URL و ADMIN_PASSWORD را پر کنید
npm install
npx prisma db push
npm run dev
```

## امنیت
- پنل فقط با رمز مدیر
- API فعال‌سازی عمومی است (کد لازم دارد)
- لایسنس به `deviceId` قفل می‌شود
- با قطع دسترسی در پنل، در ورود بعدی اپ مسدود می‌شود
"# Personal-Time-Tracker-License" 
