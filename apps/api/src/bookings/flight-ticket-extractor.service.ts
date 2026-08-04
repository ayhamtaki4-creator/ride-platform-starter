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

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  error?: { message?: string };
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
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return this.manualRequired(
        'تم حفظ التذكرة، لكن الاستخراج التلقائي يحتاج ضبط OPENAI_API_KEY على الخادم.'
      );
    }

    const model =
      this.config.get<string>('OPENAI_TICKET_MODEL') ?? 'gpt-4o-mini';
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const fileInput =
      file.mimetype === 'application/pdf'
        ? {
            type: 'input_file',
            filename: file.originalname || 'flight-ticket.pdf',
            file_data: dataUrl,
            detail: 'high'
          }
        : {
            type: 'input_image',
            image_url: dataUrl,
            detail: 'high'
          };

    const routeHint = routeContext?.trim()
      ? `The selected ground-transfer route is: ${routeContext.trim()}.`
      : '';

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'user',
              content: [
                fileInput,
                {
                  type: 'input_text',
                  text: [
                    'Extract only clearly visible flight-ticket data.',
                    'Focus on the arrival segment into Beirut (BEY) or Amman (AMM) when present.',
                    'Return arrivalDate as YYYY-MM-DD and arrivalTime as HH:mm in local airport time.',
                    'Normalize flightNumber without unnecessary spaces, for example ME265.',
                    'Use empty strings for values that are not clearly visible and do not guess.',
                    routeHint
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
              ]
            }
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'flight_ticket_extraction',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  isFlightTicket: { type: 'boolean' },
                  arrivalDate: { type: 'string' },
                  arrivalTime: { type: 'string' },
                  flightNumber: { type: 'string' },
                  arrivalAirportCode: { type: 'string' },
                  passengerName: { type: 'string' },
                  airlineName: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  warning: { type: 'string' }
                },
                required: [
                  'isFlightTicket',
                  'arrivalDate',
                  'arrivalTime',
                  'flightNumber',
                  'arrivalAirportCode',
                  'passengerName',
                  'airlineName',
                  'confidence',
                  'warning'
                ],
                additionalProperties: false
              }
            }
          }
        }),
        signal: AbortSignal.timeout(30000)
      });

      const body = (await response.json().catch(() => null)) as OpenAIResponse | null;
      if (!response.ok) {
        throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`);
      }

      const outputText = body?.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'output_text')?.text;
      if (!outputText) throw new Error('لم يرجع نموذج الاستخراج بيانات قابلة للقراءة.');

      const parsed = JSON.parse(outputText) as RawExtraction;
      if (!parsed.isFlightTicket) {
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
          (hasCoreFields
            ? null
            : 'لم تظهر كل البيانات بوضوح. راجع الحقول وأكمل الناقص يدويًا.')
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
