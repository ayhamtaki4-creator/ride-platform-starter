import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';

export const DEFAULT_ASSISTANT_WELCOME =
  'أهلًا بك في طريق الشام! كيف يمكنني مساعدتك في المسارات والحجز والتواصل؟';

export type AssistantFaq = { question: string; answer: string };
export type AssistantPublicConfiguration = {
  enabled: boolean;
  welcomeMessage: string;
  faqs: AssistantFaq[];
};

export const ASSISTANT_EVENTS = [
  'OPEN',
  'QUESTION',
  'FARE_VIEW',
  'QUOTE_SUCCESS',
  'BOOKING_CLICK',
  'WHATSAPP_CLICK'
] as const;

export const ASSISTANT_TOPICS = [
  'general', 'booking', 'prices', 'routes', 'guest', 'luggage',
  'flight', 'status', 'driver', 'change', 'payment', 'support', 'custom'
] as const;

export type AssistantEvent = (typeof ASSISTANT_EVENTS)[number];
export type AssistantTopic = (typeof ASSISTANT_TOPICS)[number];

function safeFaqs(raw: unknown): AssistantFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((item): AssistantFaq[] => {
    if (!item || typeof item !== 'object') return [];
    const question = (item as Record<string, unknown>).question;
    const answer = (item as Record<string, unknown>).answer;
    if (typeof question !== 'string' || typeof answer !== 'string') return [];
    if (!question.trim() || !answer.trim()) return [];
    return [{ question: question.trim().slice(0, 120), answer: answer.trim().slice(0, 650) }];
  });
}

@Injectable()
export class AssistantConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: AuthRateLimitService
  ) {}

  async publicConfig(): Promise<AssistantPublicConfiguration> {
    const saved = await this.prisma.assistantConfiguration.findUnique({ where: { id: 'main' } });
    return {
      enabled: saved?.enabled ?? true,
      welcomeMessage: saved?.welcomeMessage || DEFAULT_ASSISTANT_WELCOME,
      faqs: safeFaqs(saved?.faqs)
    };
  }

  async saveConfig(actorId: string, input: AssistantPublicConfiguration) {
    const faqs = input.faqs.map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim()
    }));
    if (new Set(faqs.map((item) => item.question.toLocaleLowerCase())).size !== faqs.length) {
      throw new BadRequestException('يوجد سؤال مكرر؛ عدّل الأسئلة المكررة أولاً.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.assistantConfiguration.upsert({
        where: { id: 'main' },
        create: {
          id: 'main',
          enabled: input.enabled,
          welcomeMessage: input.welcomeMessage.trim(),
          faqs: faqs as Prisma.InputJsonValue
        },
        update: {
          enabled: input.enabled,
          welcomeMessage: input.welcomeMessage.trim(),
          faqs: faqs as Prisma.InputJsonValue
        }
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'assistant.configuration.update',
          entityType: 'AssistantConfiguration',
          entityId: 'main',
          metadata: { enabled: input.enabled, faqCount: faqs.length }
        }
      });
      return stored;
    });
    return {
      enabled: updated.enabled,
      welcomeMessage: updated.welcomeMessage,
      faqs: safeFaqs(updated.faqs)
    };
  }

  async recordEvent(ip: string | undefined, event: AssistantEvent, topic: AssistantTopic) {
    // Reports are anonymous and consent-gated in the client. Events contain no free text.
    await this.rateLimit.assertAssistantMetricAllowed(ip);
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await this.prisma.assistantMetric.upsert({
      where: { day_event_topic: { day, event, topic } },
      create: { day, event, topic, count: 1 },
      update: { count: { increment: 1 } }
    });
    return { recorded: true };
  }

  async metrics() {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 29);
    const items = await this.prisma.assistantMetric.findMany({
      where: { day: { gte: since } },
      orderBy: [{ day: 'desc' }, { event: 'asc' }, { topic: 'asc' }]
    });
    const totals: Record<string, number> = Object.fromEntries(ASSISTANT_EVENTS.map((event) => [event, 0]));
    const topics: Record<string, number> = {};
    const daily: Record<string, number> = {};
    for (const item of items) {
      totals[item.event] = (totals[item.event] ?? 0) + item.count;
      if (item.event === 'QUESTION') topics[item.topic] = (topics[item.topic] ?? 0) + item.count;
      const date = item.day.toISOString().slice(0, 10);
      if (item.event === 'OPEN') daily[date] = (daily[date] ?? 0) + item.count;
    }
    return {
      periodDays: 30,
      note: 'أحداث إجمالية اختيارية من الزوار الذين وافقوا على التحليلات؛ ليست أعداد عملاء فريدين ولا سجلات محادثات.',
      totals,
      topics,
      daily: Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }))
    };
  }
}
