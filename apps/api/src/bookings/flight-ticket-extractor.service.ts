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
    routeContext?: string
  ): Promise<FlightTicketExtraction> {
    // Prefer GEMINI_API_KEY for Gemini; fall back to OPENAI_API_KEY for compatibility
    const apiKey =
      this.config.get<string>('GEMINI_API_KEY') || this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return this.manualRequired(
        'تم حفظ التذكرة، لكن الاستخراج التلقائي يحتاج ضبط GEMINI_API_KEY على الخادم.'
      );
    }

    const model = 'gemini-2.0-flash';
    const geminiUrl =
      this.config.get<string>('GEMINI_API_URL') ||
      `https://generative.googleapis.com/v1/models/${model}:generate`;

    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    // We will inline the data URL into the prompt so the Gemini endpoint can access the file content.
    const filePayload =
      file.mimetype === 'application/pdf'
        ? `FILE: ${file.originalname || 'flight-ticket.pdf'}\nMIMETYPE: ${file.mimetype}\nDATA: ${dataUrl}`
        : `IMAGE_DATA: ${dataUrl}`;

    const routeHint = routeContext?.trim()
      ? `The selected ground-transfer route is: ${routeContext.trim()}.`
      : '';

    const instructions = [
      'Extract only clearly visible flight-ticket data.',
      'Focus on the arrival segment into Beirut (BEY) or Amman (AMM) when present.',
      'Return arrivalDate as YYYY-MM-DD and arrivalTime as HH:mm in local airport time.',
      'Normalize flightNumber without unnecessary spaces, for example ME265.',
      'Use empty strings for values that are not clearly visible and do not guess.',
      routeHint,
      '',
      // Instruct the model to output a single JSON object with the exact keys used by the service.
      'Output: a single JSON object exactly matching the schema below. Do not add any surrounding text or explanation. Use empty strings for unknown values. Example schema keys:',
      JSON.stringify(
        {
          isFlightTicket: true,
          arrivalDate: 'YYYY-MM-DD',
          arrivalTime: 'HH:mm',
          flightNumber: 'string',
          arrivalAirportCode: 'string',
          passengerName: 'string',
          airlineName: 'string',
          confidence: 0.0,
          warning: 'string'
        },
        null,
        2
      )
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `${filePayload}\n\n${instructions}`;

    try {
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        // We send a generic body that most Gemini/Generative endpoints accept: {prompt: { text: ... }}.
        // If your target Gemini endpoint expects a different shape (e.g., instances / input), set GEMINI_API_URL accordingly
        // via configuration. The implementation below also attempts to locate JSON in the response robustly.
        body: JSON.stringify({ prompt: { text: prompt } }),
        signal: AbortSignal.timeout(30000)
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          (body && (body.error?.message || body.error)) || `Gemini HTTP ${response.status}`;
        throw new Error(String(message));
      }

      // Try to extract a JSON substring from the response body. Gemini responses vary by endpoint;
      // be permissive: search for the first JSON object-looking string and parse it.
      const findJsonInValue = (val: any): string | null => {
        if (typeof val === 'string') {
          const match = val.match(/\{[\s\S]*\}/);
          if (match) return match[0];
          return null;
        }
        if (Array.isArray(val)) {
          for (const item of val) {
            const r = findJsonInValue(item);
            if (r) return r;
          }
        }
        if (val && typeof val === 'object') {
          for (const k of Object.keys(val)) {
            const r = findJsonInValue(val[k]);
            if (r) return r;
          }
        }
        return null;
      };

      const jsonString = findJsonInValue(body);
      if (!jsonString) throw new Error('لم يرجع نموذج الاستخراج بيانات قابلة للقراءة.');

      const parsed = JSON.parse(jsonString) as RawExtraction;

      if (!parsed?.isFlightTicket) {
        return this.manualRequired('الملف المرفوع لا يبدو كتذكرة طيران واضحة.');
      }

      const arrivalDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.arrivalDate)
        ? parsed.arrivalDate
        : null;
      const arrivalTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.arrivalTime)
        ? parsed.arrivalTime
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
