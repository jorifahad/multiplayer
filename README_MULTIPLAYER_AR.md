# تشغيل نسخة اللعب التعاوني

هذه نسخة أولية للاعبين داخل غرفة برمز من 5 خانات.

## الملفات التي تستبدلينها أو تضيفينها

- غيّري اسم `main_multiplayer.ts` إلى `main.ts` واستبدلي الملف القديم.
- ضعي `MultiplayerManager.ts` بجانب `main.ts`.
- ضعي `server.ts` بجانب `package.json`.
- احتفظي بملف `AdaptiveDifficulty.ts` الموجود عندك.
- انسخي متغيرات `.env.example` إلى ملف جديد اسمه `.env`.

## تثبيت المكتبات

داخل مجلد المشروع:

```powershell
npm install express socket.io socket.io-client cors
npm install -D tsx @types/express @types/cors
```

أضيفي هذه الأوامر داخل قسم `scripts` في `package.json`:

```json
"dev": "vite",
"server": "tsx server.ts",
"build": "vite build",
"preview": "vite preview"
```

## التجربة على جهاز واحد

افتحي Terminal أول:

```powershell
npm run server
```

ثم Terminal ثانٍ:

```powershell
npm run dev
```

افتحي اللعبة في نافذتين أو متصفحين مختلفين. في الأولى اختاري Create Room، وفي الثانية اكتبي الرمز واختاري Join.

## التشغيل عبر الإنترنت

1. ارفعي `server.ts` على Render أو Railway، واجعلي أمر التشغيل:

```text
npm run server
```

2. أضيفي في خدمة السيرفر متغير البيئة:

```text
CLIENT_ORIGIN=https://رابط-اللعبة
```

3. في استضافة اللعبة أضيفي:

```text
VITE_SERVER_URL=https://رابط-السيرفر
```

4. أعيدي بناء ونشر اللعبة.

## ما تتم مزامنته

- دخول لاعبين للغرفة.
- مكان واتجاه اللاعب الآخر.
- إطلاق النار المرئي.
- إصابات الزومبي وقتلهم.
- مواقع وحالة الزومبي من جهاز صاحب الغرفة.

هذه نسخة تجريبية لشخصين. صاحب الغرفة هو المسؤول عن حركة الزومبي، لذلك لو خرج تنتهي الغرفة.

## تحديث شاشة الغرفة
بعد الضغط على **Create Room** يبقى صاحب الغرفة في شاشة الانتظار، ويظهر رمز الغرفة مع زر **Copy Code**. بعد دخول اللاعب الثاني يتفعّل زر **Start Game**، وعند الضغط عليه تبدأ اللعبة عند اللاعبين في نفس الوقت.
