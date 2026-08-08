import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LocationThrottleDecision = {
  throttled: boolean;
  retryAfterMs: number;
};

@Injectable()
export class LocationIngressThrottleService {
  private readonly minIntervalMs: number;
  private readonly acceptedAt = new Map<string, number>();

  constructor(config: ConfigService) {
    const configured = Number(config.get<string>('GPS_SERVER_MIN_INTERVAL_MS') ?? '1500');
    this.minIntervalMs = Number.isFinite(configured)
      ? Math.min(10_000, Math.max(250, Math.round(configured)))
      : 1500;
  }

  check(userId: string, tripId: string): LocationThrottleDecision {
    const lastAcceptedAt = this.acceptedAt.get(this.key(userId, tripId));
    if (!lastAcceptedAt) return { throttled: false, retryAfterMs: 0 };

    const elapsed = Date.now() - lastAcceptedAt;
    if (elapsed >= this.minIntervalMs) return { throttled: false, retryAfterMs: 0 };

    return {
      throttled: true,
      retryAfterMs: Math.max(1, this.minIntervalMs - elapsed)
    };
  }

  markAccepted(userId: string, tripId: string) {
    this.acceptedAt.set(this.key(userId, tripId), Date.now());
    this.pruneIfNeeded();
  }

  private key(userId: string, tripId: string) {
    return `${userId}:${tripId}`;
  }

  private pruneIfNeeded() {
    if (this.acceptedAt.size <= 5000) return;
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, acceptedAt] of this.acceptedAt) {
      if (acceptedAt < cutoff) this.acceptedAt.delete(key);
    }
  }
}
