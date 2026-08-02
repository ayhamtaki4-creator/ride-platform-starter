import { Injectable } from '@nestjs/common';
import { Namespace, Server } from 'socket.io';

export type TripRealtimeEvent = {
  tripId: string;
  passengerId: string;
  driverId?: string | null;
  previousDriverId?: string | null;
  status: string;
  bookingStatus?: string;
  bookingReference?: string | null;
  occurredAt: string;
  reason?: string | null;
};


export type ServiceRunRealtimeEvent = {
  runId: string;
  runReference: string;
  driverId: string;
  previousDriverId?: string | null;
  passengerIds: string[];
  status: string;
  occurredAt: string;
  reason?: string | null;
  bookingId?: string;
  passengerStatus?: string;
};

export type DriverAvailabilityRealtimeEvent = {
  driverId: string;
  availability: string;
  occurredAt: string;
};

@Injectable()
export class RealtimeEventsService {
  private server?: Server | Namespace;

  attachServer(server: Server | Namespace) {
    this.server = server;
  }

  bookingCreated(event: TripRealtimeEvent) {
    this.server?.to('role:dispatch').emit('admin.booking.created', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.booking.updated', event);
  }

  bookingUpdated(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('booking.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.booking.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.booking.updated', event);
  }

  tripCreated(event: TripRealtimeEvent) {
    this.server?.to('role:dispatch').emit('admin.trip.created', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    this.server?.to(`trip:${event.tripId}`).emit('trip.status.updated', event);
  }

  tripAssigned(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('trip.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.trip.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    if (event.driverId) {
      this.server?.to(`user:${event.driverId}`).emit('driver.trip.assigned', event);
    }
  }

  tripUpdated(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('trip.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.trip.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    if (event.driverId) {
      this.server?.to(`user:${event.driverId}`).emit('driver.trip.updated', event);
    }
  }

  tripUnassigned(event: TripRealtimeEvent) {
    this.tripUpdated(event);
    if (event.previousDriverId) {
      this.server?.to(`user:${event.previousDriverId}`).emit('driver.trip.unassigned', event);
    }
  }

  tripReassigned(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('trip.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.trip.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    if (event.previousDriverId) {
      this.server?.to(`user:${event.previousDriverId}`).emit('driver.trip.unassigned', event);
    }
    if (event.driverId) {
      this.server?.to(`user:${event.driverId}`).emit('driver.trip.assigned', event);
    }
  }


  runCreated(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.created', event);
    this.server?.to('role:dispatch').emit('admin.run.created', event);
  }

  runUpdated(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.updated', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
  }

  runDriverAssigned(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.driver.assigned', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
    this.server?.to(`user:${event.driverId}`).emit('driver.run.assigned', event);
    if (event.previousDriverId) {
      this.server?.to(`user:${event.previousDriverId}`).emit('driver.run.unassigned', event);
    }
  }

  runDriverAccepted(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.driver.accepted', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
    this.server?.to(`user:${event.driverId}`).emit('driver.run.updated', event);
  }

  runPassengerUpdated(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.passenger.updated', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
  }

  runStarted(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.started', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
  }

  runCompleted(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.completed', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
  }

  private emitRunEvent(name: string, event: ServiceRunRealtimeEvent) {
    const rooms = [
      'role:dispatch',
      `user:${event.driverId}`,
      `run:${event.runId}`,
      ...event.passengerIds.map((id) => `user:${id}`)
    ];
    this.server?.to(rooms).emit(name, event);
    this.server?.to(`user:${event.driverId}`).emit('driver.run.updated', event);
    for (const passengerId of event.passengerIds) {
      this.server?.to(`user:${passengerId}`).emit('rider.run.updated', event);
    }
  }

  driverAvailabilityUpdated(event: DriverAvailabilityRealtimeEvent) {
    this.server?.to('role:dispatch').emit('admin.driver.availability.updated', event);
    this.server?.to(`user:${event.driverId}`).emit('driver.availability.updated', event);
  }
}
