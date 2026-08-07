import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadedMediaFile } from '../media/media.service';

export type FlightTicketExtraction = {
  status: 'EXTRACTED' | 'MANUAL_REQUIRED';
  arrivalDate: string | null;
  arrivalTime: string | null;
  flightNumber: string | null;
  arrivalAirportCode: string | null;
  passengerName: string | null;
  airlineName: string | null;
  confidence: number;
  warning: string | null;
};

type RawExtraction = {
  isFlightTicket: boolean;
  arrivalDate: string;
  arrivalTime: string;
  flightNumber: string;
  arrivalAirportCode: string;
  passengerName: string;
  airlineName: string;
  confidence: number;
  warning: string;
};

@Injectable()
export class FlightTicketExtractorService {
  private readonly logger = new Logger(FlightTicketExtractorService.name);

  constructor(private readonly config: ConfigService) {}

  async extract(
    file: UploadedMediaFile,
    routeContext?: string,
    flightTimeMode: 'ARRIVAL' | 'DEPARTURE' = 'ARRIVAL'
  ): Promise<FlightTicketExtraction> {
    const apiKey =
      this.config.get<string>('GEMINI_API_KEY') || this.config.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      return this.manualRequired(
        'تم حفظ التذكرة، لكن الاستخراج التلقائي يحتاج ضبط GEMINI_API_KEY على الخادم.'
      );
    }

    const rawModel =
      this.config.get<string>('GEMINI_TICKET_MODEL') || 'gemini-flash-latest';
    const model = rawModel.replace(/^"|"$/g, '').trim();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const routeHint = routeContext?.trim()
      ? `The selected ground-transfer route is: ${routeContext.trim()}.`
      : '';
    const currentYear = new Date().getFullYear();
    const timingInstruction =
      flightTimeMode === 'DEPARTURE'
        ? 'Extract the DEPARTURE/TAKEOFF date and local departure time for the selected flight segment. Store that selected departure date/time in the JSON keys arrivalDate and arrivalTime for backward API compatibility. Do NOT substitute the arrival time.'
        : 'Extract the ARRIVAL date and local arrival time for the selected flight segment. Store them in arrivalDate and arrivalTime.';

    const instructions = [
      'Extract only clearly visible flight-ticket data.',
      timingInstruction,
      'Use the selected ground-transfer route to identify the relevant airport/flight segment when possible.',
      `IMPORTANT FOR DATES: Convert any date format on the ticket (e.g. "15 OCT", "15/10/2026", "OCT 15") into exact ISO format YYYY-MM-DD. If year is missing on ticket, assume ${currentYear}.`,
      'Return arrivalTime as HH:mm in 24-hour local airport time format (the key name remains arrivalTime for API compatibility even in departure mode).',
      'Normalize flightNumber without unnecessary spaces, for example ME265.',
      'Use empty strings for values that are not clearly visible and do not guess.',
      routeHint,
      'Output: a single JSON object matching the requested schema exactly.',
      JSON.stringify({
        isFlightTicket: true,
        arrivalDate: 'YYYY-MM-DD',
        arrivalTime: 'HH:mm',
        flightNumber: 'string',
        arrivalAirportCode: 'string',
        passengerName: 'string',
        airlineName: 'string',
        confidence: 0.0,
        warning: 'string'
      })
    ]
      .filter(Boolean)
      .join('\n');

    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: file.mimetype || 'image/jpeg',
                data: file.buffer.toString('base64')
              }
            },
            { text: instructions }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    };

    try {
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          (body && (body.error?.message || body.error)) || `Gemini HTTP ${response.status}`;
        throw new Error(String(message));
      }

      const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('لم يرجع نموذج الاستخراج أي بيانات.');

      const parsed = JSON.parse(rawText) as RawExtraction;
      if (!parsed?.isFlightTicket) {
        return this.manualRequired('الملف المرفوع لا يبدو كتذكرة طيران واضحة.');
      }

      const arrivalDate = this.normalizeDate(parsed.arrivalDate);
      const arrivalTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.arrivalTime?.trim())
        ? parsed.arrivalTime.trim()
        : null;
      const flightNumber = this.clean(parsed.flightNumber);
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      const hasCoreFields = Boolean(arrivalDate && arrivalTime && flightNumber);

      return {
        status: hasCoreFields ? 'EXTRACTED' : 'MANUAL_REQUIRED',
        arrivalDate,
        arrivalTime,
        flightNumber,
        arrivalAirportCode: this.clean(parsed.arrivalAirportCode)?.toUpperCase() ?? null,
        passengerName: this.clean(parsed.passengerName),
        airlineName: this.clean(parsed.airlineName),
        confidence,
        warning:
          this.clean(parsed.warning) ??
          (hasCoreFields ? null : 'لم تظهر كل البيانات بوضوح. راجع الحقول وأكمل الناقص يدويًا.')
      };
    } catch (error) {
      this.logger.warn(
        `Flight ticket extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return this.manualRequired(
        'تم حفظ التذكرة، لكن تعذر استخراج بياناتها تلقائيًا. أدخل البيانات يدويًا.'
      );
    }
  }

  private normalizeDate(rawDate?: string): string | null {
    if (!rawDate || !rawDate.trim()) return null;
    const cleaned = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
    const parsedTimestamp = Date.parse(cleaned);
    if (!isNaN(parsedTimestamp)) {
      const d = new Date(parsedTimestamp);
      return d.toISOString().split('T')[0];
    }
    return null;
  }

  private manualRequired(warning: string): FlightTicketExtraction {
    return {
      status: 'MANUAL_REQUIRED',
      arrivalDate: null,
      arrivalTime: null,
      flightNumber: null,
      arrivalAirportCode: null,
      passengerName: null,
      airlineName: null,
      confidence: 0,
      warning
    };
  }

  private clean(value: string | undefined) {
    const cleaned = value?.trim();
    return cleaned || null;
  }
}
