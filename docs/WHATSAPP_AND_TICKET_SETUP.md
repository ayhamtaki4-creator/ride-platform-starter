# إعداد WhatsApp واستخراج تذكرة الطيران

## 1. تفعيل WhatsApp Cloud API

أنشئ تطبيقًا تجاريًا في Meta، أضف WhatsApp، ثم احصل على:

- Access Token دائم للخادم.
- Phone Number ID لرقم الشركة.
- قالب Utility معتمد باسم `ride_booking_update` ولغة عربية `ar`.

نص القالب المقترح، بترتيب المتغيرات الذي يتوقعه الكود:

```text
مرحبًا {{1}}
{{2}}
{{3}}
رقم المرجع: {{4}}
التفاصيل: {{5}}
```

اضبط المتغيرات التالية في Render، ولا تضع القيم السرية في GitHub:

```env
WHATSAPP_ENABLED=true
WHATSAPP_ACCESS_TOKEN=<permanent-server-token>
WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_STATUS_TEMPLATE=ride_booking_update
WHATSAPP_TEMPLATE_LANGUAGE=ar
PORTAL_URL=https://your-domain.example
```

تستخدم المنصة القوالب لأن التحديثات التشغيلية قد تُرسل خارج نافذة محادثة خدمة العملاء. راجع [قوالب WhatsApp الرسمية](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) و[إرسال الرسائل عبر Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages).

بعد النشر افتح صفحة الإدارة `/admin/whatsapp` للتأكد من أن الحالة `مفعلة` و`مكتمل`، ولمراجعة الرسائل الفاشلة وإعادة إرسالها.

## 2. تفعيل استخراج بيانات التذكرة

اضبط في Render:

```env
OPENAI_API_KEY=<server-api-key>
OPENAI_TICKET_MODEL=gpt-4o-mini
```

لا يصل المفتاح إلى المتصفح؛ الاستدعاء يتم من الـAPI فقط. ترفع الواجهة صور JPG/PNG/WEBP أو ملف PDF حتى 10MB، ثم تستخرج:

- تاريخ الوصول بصيغة `YYYY-MM-DD`.
- وقت الوصول بصيغة `HH:mm`.
- رقم الرحلة.
- رمز مطار الوصول واسم المسافر وشركة الطيران عند وضوحها.

الحقول تبقى قابلة للتصحيح اليدوي. عند غياب المفتاح أو عدم وضوح الملف يُحفظ الملف وتظهر مطالبة بإكمال البيانات يدويًا. راجع [دليل إدخال الملفات الرسمي](https://developers.openai.com/api/docs/guides/file-inputs) و[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## 3. الجلسة الطويلة

```env
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
```

رمز الوصول القصير يتجدد تلقائيًا من جلسة دوارة لمدة 30 يومًا. تسجيل الخروج يبطل جلسة التجديد الحالية.

## 4. حفظ ملفات التذاكر بصورة دائمة

ملفات التذاكر خاصة ولا تُعرض إلا للمسافر صاحب الحجز ولإدارة التشغيل. في الإنتاج يجب أن يشير `MEDIA_STORAGE_ROOT` إلى قرص دائم مركّب على خدمة الـAPI، مثل:

```env
MEDIA_STORAGE_ROOT=/var/data/ride-media
```

لا تعتمد على مجلد الخدمة المؤقت؛ إعادة النشر قد تحذفه. قاعدة البيانات تحفظ بيانات الملف ونتيجة الاستخراج، بينما الملف الأصلي يُحفظ في المسار الدائم أعلاه.
