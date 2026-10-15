"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import styles from "./site-assistant.module.css";
import { AssistantLiveQuote } from "./assistant-live-quote";
import { whatsappHref } from "@/lib/whatsapp-link";
import { fetchAssistantConfig, recordAssistantEvent, type AssistantConfiguration, type AssistantFaq, type AssistantMetricTopic } from "@/lib/assistant-config";

type TopicId = "booking" | "prices" | "routes" | "guest" | "luggage" | "flight" | "status" | "driver" | "change" | "payment" | "support";

type Topic = {
  id: TopicId;
  title: string;
  answer: string;
  href?: string;
  action?: string;
  keywords: string[];
};

type Message = {
  id: number;
  sender: "visitor" | "assistant";
  text: string;
  href?: string;
  action?: string;
};

const TOPICS: Topic[] = [
  {
    id: "booking",
    title: "كيف أحجز رحلة؟",
    answer: "اضغط «ابدأ الحجز»، ثم اختر المسار والموعد وفئة السيارة المناسبة للركاب والحقائب. راجع السعر وبياناتك قبل إرسال الطلب. يراجع مركز العمليات الحجز قبل تأكيده وتعيين السائق.",
    href: "/booking",
    action: "ابدأ الحجز",
    keywords: ["كيف احجز", "احجز", "حجز جديد", "اريد حجز", "طريقة الحجز", "book"],
  },
  {
    id: "prices",
    title: "كم سعر الرحلة؟",
    answer: "يختلف السعر حسب المسار وفئة السيارة المعتمدة. لمعرفة السعر الصحيح والمحدّث، اختر المسار والسيارة في صفحة الحجز؛ سيظهر السعر قبل إرسال الطلب. لا يعتمد المساعد أسعارًا خارج نظام الحجز.",
    href: "/booking",
    action: "عرض الأسعار في الحجز",
    keywords: ["سعر", "اسعار", "السعر", "تكلفة", "التكلفه", "بكم", "price", "دولار", "كم بتكلف"],
  },
  {
    id: "routes",
    title: "ما المسارات المتاحة؟",
    answer: "تشمل خدماتنا النقل الخاص بين دمشق ومطار بيروت، وبين دمشق ومطار الملكة علياء، وبين مطار دمشق والمحافظات السورية. تظهر الاتجاهات والمسارات المفعّلة حاليًا في نموذج الحجز.",
    href: "/services",
    action: "تعرّف على المسارات",
    keywords: ["مسار", "مسارات", "بيروت", "عمان", "الاردن", "مطار", "محافظات", "وجهة", "طريق", "route"],
  },
  {
    id: "guest",
    title: "هل أحتاج إلى حساب؟",
    answer: "لا. يمكنك إرسال طلب الحجز كضيف دون تسجيل الدخول. إنشاء حساب اختياري للاستفادة من بقية الميزات، وربط الحجوزات بالحساب يعتمد على التحقق من ملكية رقم الهاتف.",
    href: "/booking",
    action: "الحجز دون تسجيل",
    keywords: ["بدون حساب", "دون حساب", "بدون تسجيل", "دون تسجيل", "حساب", "تسجيل الدخول", "ضيف", "guest"],
  },
  {
    id: "luggage",
    title: "الركاب والحقائب",
    answer: "تختلف سعة الركاب والحقائب باختلاف فئة السيارة، وتُعرض السعة المسموحة لكل فئة داخل نموذج الحجز. اختر السيارة التي تناسب العدد الفعلي؛ وإذا لم تكن متأكدًا، تواصل مع الدعم قبل الإرسال.",
    href: "/booking",
    action: "عرض فئات السيارات",
    keywords: ["حقائب", "حقيبه", "شنط", "شنطة", "ركاب", "اشخاص", "امتعة", "عفش", "سياره كبيره", "luggage"],
  },
  {
    id: "flight",
    title: "معلومات رحلة الطيران",
    answer: "عند طلب معلومات الطيران، أدخل رقم الرحلة ووقت الوصول أو الإقلاع بدقة. قد تتيح الإدارة إرفاق التذكرة لبعض المسارات. إذا تغيّر موعد الطائرة بعد إرسال الطلب، تواصل مع الدعم لتنسيق التعديل.",
    href: "/booking",
    action: "تفاصيل الحجز",
    keywords: ["طيران", "طائرة", "طياره", "تذكرة", "تذكره", "رحلة جوية", "رقم الرحلة", "موعد الطائرة", "flight"],
  },
  {
    id: "status",
    title: "كيف أتابع حجزي؟",
    answer: "إذا كان لديك حساب مرتبط بالحجز، يمكنك مراجعة الحجوزات من لوحة المسافر. إذا حجزت كضيف أو احتجت مساعدة في حالة الطلب، تواصل مع مركز العمليات واذكر مرجع الحجز. لا يمكن للمساعد الاطلاع على حجوزاتك أو بياناتك الشخصية.",
    href: "/contact",
    action: "التواصل لمتابعة الحجز",
    keywords: ["حجزي", "حجز سابق", "رقم الحجز", "مرجع الحجز", "متابعة الحجز", "حالة الطلب", "تأكيد الحجز", "حجوزاتي", "status"],
  },
  {
    id: "driver",
    title: "متى تظهر بيانات السائق؟",
    answer: "تظهر بيانات السائق والمركبة وفق حالة الحجز بعد مراجعة الإدارة وتعيين السائق. تتوفر متابعة الرحلة ومشاركة رابط التتبع عند تفعيلها للرحلة المعنية.",
    href: "/contact",
    action: "الاستفسار من الدعم",
    keywords: ["سائق", "السائق", "رقم السائق", "سيارة السائق", "تتبع", "موقع السائق", "driver", "gps"],
  },
  {
    id: "change",
    title: "تعديل أو إلغاء حجز",
    answer: "لتعديل موعد الحجز أو طلب إلغائه، تواصل مع مركز العمليات واذكر مرجع الحجز. تعتمد إمكانية التعديل أو الإلغاء على حالة الطلب وشروط الحجز؛ لا يجري المساعد أي تعديل تلقائي.",
    href: "/contact",
    action: "طلب مساعدة من الدعم",
    keywords: ["الغاء", "تلغى", "تعديل", "غير الموعد", "تأجيل", "تاخير", "اجل", "cancel", "modify"],
  },
  {
    id: "payment",
    title: "كيف يتم الدفع؟",
    answer: "لمعرفة خيارات الدفع المعتمدة لحجزك، يرجى التواصل مع مركز العمليات قبل الرحلة. لا تطلب هذه المحادثة أي بيانات بطاقة دفع أو تحويل مالي.",
    href: "/contact",
    action: "الاستفسار عن الدفع",
    keywords: ["دفع", "الدفع", "بطاقة بنكية", "فيزا", "كاش", "نقدا", "payment"],
  },
  {
    id: "support",
    title: "التواصل مع الدعم",
    answer: "فريق طريق الشام يساعدك في الاستفسارات والحجوزات. يمكنك مراسلته على واتساب في سوريا (+963 965 350 502) أو لبنان (+961 71 967 194) عبر صفحة التواصل.",
    href: "/contact",
    action: "وسائل التواصل والدعم",
    keywords: ["دعم", "مساعده", "موظف", "بشري", "واتساب", "تواصل", "اتصال", "رقم الهاتف", "شكوى", "support", "whatsapp"],
  },
];

const quickTopics: TopicId[] = ["booking", "prices", "routes", "status", "support"];
const safeSupportTopics: Partial<Record<TopicId, string>> = {
  booking: "طريقة الحجز",
  prices: "أسعار الرحلات",
  routes: "المسارات المتاحة",
  guest: "الحجز دون حساب",
  luggage: "الركاب والحقائب",
  flight: "معلومات رحلة الطيران",
  status: "متابعة حجز سابق",
  driver: "بيانات السائق والتتبع",
  change: "تعديل أو إلغاء الحجز",
  payment: "طرق الدفع",
  support: "خدمة العملاء",
};

const WELCOME: Message = {
  id: 0,
  sender: "assistant",
  text: "أهلًا بك في طريق الشام! أنا مساعد آلي للأسئلة الشائعة، أساعدك في معرفة المسارات والحجز وخيارات التواصل. كيف يمكنني مساعدتك؟",
};

function normalizeArabic(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findTopic(input: string): Topic | undefined {
  const text = normalizeArabic(input);
  if (!text) return undefined;
  return TOPICS
    .map((topic) => ({
      topic,
      score: topic.keywords.reduce((score, keyword) => {
        const normalizedKeyword = normalizeArabic(keyword);
        if (!text.includes(normalizedKeyword)) return score;
        return score + (normalizedKeyword.includes(" ") ? 3 : 1);
      }, 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.topic;
}

export function SiteAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [sending, setSending] = useState(false);
  const [showLiveQuotes, setShowLiveQuotes] = useState(false);
  const [supportTopic, setSupportTopic] = useState<TopicId | null>(null);
  const [configuration, setConfiguration] = useState<AssistantConfiguration | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function refreshConfig() {
      try {
        const data = await fetchAssistantConfig(AbortSignal.timeout(18000));
        if (!cancelled) setConfiguration(data);
      } catch {
        if (!cancelled) setConfiguration(null);
      }
    }
    void refreshConfig();
    const timer = window.setInterval(() => void refreshConfig(), 45000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!configuration?.enabled) setOpen(false);
    if (configuration?.welcomeMessage) setMessages((messages) => messages.map((message) => message.id === 0 ? { ...message, text: configuration.welcomeMessage } : message));
  }, [configuration?.enabled, configuration?.welcomeMessage]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function appendExchange(question: string, topic?: Topic, custom?: AssistantFaq) {
    const fallback = {
      answer: "لا أملك إجابة مؤكدة عن هذا السؤال. يمكنك اختيار أحد المواضيع أدناه أو التواصل مع فريق الدعم للحصول على معلومات دقيقة.",
      href: "/contact",
      action: "التواصل مع الدعم",
    };
    const reply: { answer: string; href?: string; action?: string } = custom ? { answer: custom.answer } : topic ?? fallback;
    const id = nextId.current;
    nextId.current += 2;
    setMessages((current) => [
      ...current.slice(-18),
      { id, sender: "visitor", text: question },
      { id: id + 1, sender: "assistant", text: reply.answer, href: reply.href, action: reply.action },
    ]);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim().slice(0, 500);
    if (!value || sending) return;

    const topic = findTopic(value);
    const customFaq = configuration?.faqs.find((faq) => normalizeArabic(faq.question) === normalizeArabic(value));
    if (customFaq) {
      appendExchange(value, undefined, customFaq);
      setSupportTopic(null);
      recordAssistantEvent("QUESTION", "custom");
      setDraft("");
      return;
    }
    recordAssistantEvent("QUESTION", (topic?.id ?? "general") as AssistantMetricTopic);
    if (topic) setSupportTopic(topic.id);
    const explicitRouteRequest = /(مسار|مسارات|خطوط|الوجهات|وجهات|الرحلات المتاحه|السفر من|طرق النقل|route)/.test(normalizeArabic(value));
    if (topic?.id === "prices" || (topic?.id === "routes" && explicitRouteRequest)) {
      appendExchange(value, topic);
      setDraft("");
      setShowLiveQuotes(true);
      recordAssistantEvent("FARE_VIEW", topic?.id === "prices" ? "prices" : "routes");
      return;
    }
    const history = messages
      .filter((message) => message.id !== 0)
      .slice(-6)
      .map((message) => ({
        role: message.sender === "visitor" ? "user" : "assistant",
        content: message.text,
      }));

    const id = nextId.current;
    nextId.current += 2;
    setMessages((current) => [...current.slice(-18), { id, sender: "visitor", text: value }]);
    setDraft("");
    setSending(true);

    let answer = topic?.answer || "المساعد الذكي غير متاح حالياً. يمكنك اختيار موضوع من الأسئلة السريعة أو مراسلة فريق الدعم.";
    let href = topic?.href || "/contact";
    let action = topic?.action || "التواصل مع الدعم";

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, history }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("AI_UNAVAILABLE");
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("answer" in data) ||
        typeof data.answer !== "string" || !data.answer.trim()) {
        throw new Error("INVALID_AI_RESPONSE");
      }
      answer = data.answer.trim().slice(0, 1400);
    } catch {
      // The existing, free FAQ answers keep the visitor supported when AI is unavailable.
    } finally {
      setMessages((current) => [
        ...current.slice(-19),
        { id: id + 1, sender: "assistant", text: answer, href, action },
      ]);
      setSending(false);
    }
  }

  function selectTopic(topic: Topic) {
    setSupportTopic(topic.id);
    appendExchange(topic.title, topic);
    if (topic.id === "prices" || topic.id === "routes") {
      setShowLiveQuotes(true);
      recordAssistantEvent("FARE_VIEW", topic.id);
    }
  }

  function selectCustomFaq(faq: AssistantFaq) {
    appendExchange(faq.question, undefined, faq);
    recordAssistantEvent("QUESTION", "custom");
  }

  const whatsappIntro = encodeURIComponent(`مرحباً، أحتاج إلى مساعدة من فريق طريق الشام بخصوص ${supportTopic ? safeSupportTopics[supportTopic] : "خدمة النقل"}.`);

  if (!configuration?.enabled) return null;

  return (
    <div className={styles.container} dir="rtl">
      {open ? (
        <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="site-assistant-heading" id="site-assistant-panel">
          <header className={styles.header}>
            <span className={styles.headerIcon}><Icon name="sparkles" size={20} /></span>
            <div>
              <h2 id="site-assistant-heading">مساعد طريق الشام</h2>
              <p>مساعد ذكي للأسئلة والاستفسارات</p>
            </div>
            <button className={styles.close} type="button" aria-label="إغلاق المحادثة" onClick={() => setOpen(false)}>
              <Icon name="close" size={21} />
            </button>
          </header>
          {showLiveQuotes ? <AssistantLiveQuote onBack={() => setShowLiveQuotes(false)} /> : <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions text">
            {messages.map((message) => (
              <div key={message.id} className={message.sender === "visitor" ? styles.visitor : styles.assistant}>
                <p>{message.text}</p>
                {message.href && message.action ? (
                  <Link href={message.href} className={styles.action} onClick={() => { if (message.href === "/booking") recordAssistantEvent("BOOKING_CLICK", (supportTopic ?? "general") as AssistantMetricTopic); setOpen(false); }}>
                    {message.action}<Icon name="arrow-left" size={15} />
                  </Link>
                ) : null}
              </div>
            ))}
            {sending ? <div className={styles.assistant} role="status"><p>جارٍ تجهيز الرد...</p></div> : null}
            {messages.length === 1 && configuration.faqs.length > 0 ? <div className={styles.assistant}><p>أسئلة إضافية يجيب عنها فريق طريق الشام:</p></div> : null}
            <div ref={endRef} />
          </div>}
          {!showLiveQuotes ? <div className={styles.suggestions} aria-label="أسئلة سريعة">
            {quickTopics.map((id) => {
              const topic = TOPICS.find((item) => item.id === id);
              if (!topic) return null;
              return <button type="button" key={id} onClick={() => selectTopic(topic)}>{topic.title}</button>;
            })}
            {configuration.faqs.map((faq, index) => <button type="button" key={`${index}-${faq.question}`} onClick={() => selectCustomFaq(faq)}>{faq.question}</button>)}
          </div> : null}
          {!showLiveQuotes ? <form className={styles.form} onSubmit={sendMessage}>
            <label className={styles.srOnly} htmlFor="site-assistant-message">اكتب سؤالك</label>
            <input
              id="site-assistant-message"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={500}
              disabled={sending}
              placeholder="اكتب سؤالك هنا..."
              autoComplete="off"
            />
            <button disabled={!draft.trim() || sending} type="submit" aria-label="إرسال السؤال"><Icon name="arrow-left" size={20} /></button>
          </form> : null}
          <nav className={styles.supportBar} aria-label="التواصل مع موظف الدعم">
            <a href={`${whatsappHref("+963965350502")}?text=${whatsappIntro}`} target="_blank" rel="noopener noreferrer" onClick={() => recordAssistantEvent("WHATSAPP_CLICK", (supportTopic ?? "general") as AssistantMetricTopic)}>واتساب سوريا</a>
            <a href={`${whatsappHref("+96171967194")}?text=${whatsappIntro}`} target="_blank" rel="noopener noreferrer" onClick={() => recordAssistantEvent("WHATSAPP_CLICK", (supportTopic ?? "general") as AssistantMetricTopic)}>واتساب لبنان</a>
          </nav>
          <p className={styles.disclaimer}>قد تُعالج الأسئلة الحرة عبر Cloudflare AI. لا تُدخل بيانات شخصية أو كلمات مرور؛ لا ينفذ المساعد الحجوزات.</p>
        </section>
      ) : null}
      <button
        className={styles.launcher}
        type="button"
        aria-label={open ? "إغلاق مساعد طريق الشام" : "فتح مساعد طريق الشام"}
        aria-expanded={open}
        aria-controls="site-assistant-panel"
        onClick={() => setOpen((value) => { if (!value) recordAssistantEvent("OPEN"); return !value; })}
      >
        <Icon name={open ? "close" : "sparkles"} size={23} />
        {!open ? <span>كيف نساعدك؟</span> : null}
      </button>
    </div>
  );
}
