import { Icon } from "@/components/ui/icon";
import { getBookingTimeline } from "@/lib/rider-bookings";
import { Trip } from "@/lib/types";

export function BookingTimeline({ booking }: { booking: Trip }) {
  const steps = getBookingTimeline(booking);

  return (
    <ol className="rider-timeline" aria-label="مراحل الحجز">
      {steps.map((step, index) => (
        <li
          className={`${step.complete ? "is-complete" : ""} ${step.current ? "is-current" : ""} ${"danger" in step && step.danger ? "is-danger" : ""}`}
          key={step.key}
        >
          <div className="rider-timeline-marker">
            {step.complete ? <Icon name={"danger" in step && step.danger ? "close" : "check"} size={16} /> : <span>{index + 1}</span>}
          </div>
          <div>
            <strong>{step.label}</strong>
            <p>{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
