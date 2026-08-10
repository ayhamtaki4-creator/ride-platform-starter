import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../core/api_client.dart';
import '../core/driver_runtime_store.dart';
import 'realtime_service.dart';

class LocationTrackingService {
  LocationTrackingService._();

  static final LocationTrackingService instance = LocationTrackingService._();

  StreamSubscription<Position>? _subscription;
  Timer? _heartbeat;
  String? _tripId;
  Position? _lastPosition;
  bool _sending = false;

  bool get isRunning => _subscription != null && _tripId != null;
  String? get activeTripId => _tripId;

  Future<void> start(String tripId) async {
    if (_tripId == tripId && _subscription != null) return;
    await stop(clearActiveTrip: false);

    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw StateError('خدمة الموقع متوقفة. فعّل GPS ثم أعد المحاولة.');
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw StateError('يجب السماح للتطبيق باستخدام الموقع حتى يعمل التتبع.');
    }

    _tripId = tripId;
    await DriverRuntimeStore.instance.setActiveTrip(tripId);
    unawaited(RealtimeService.instance.subscribeTrip(tripId));

    final settings = _settingsForPlatform();
    _subscription = Geolocator.getPositionStream(locationSettings: settings).listen(
      (position) {
        _lastPosition = position;
        unawaited(_send(position));
      },
      onError: (_) {
        // The app keeps the active trip id and will recover tracking on reopen.
      },
      cancelOnError: false,
    );

    _heartbeat = Timer.periodic(const Duration(seconds: 20), (_) {
      final position = _lastPosition;
      if (position != null) unawaited(_send(position));
    });

    final initial = await Geolocator.getCurrentPosition(locationSettings: settings);
    _lastPosition = initial;
    await _send(initial);
  }

  Future<void> stop({bool clearActiveTrip = true}) async {
    _heartbeat?.cancel();
    _heartbeat = null;
    await _subscription?.cancel();
    _subscription = null;
    _tripId = null;
    _lastPosition = null;
    _sending = false;
    if (clearActiveTrip) {
      await DriverRuntimeStore.instance.clearActiveTrip();
    }
  }

  LocationSettings _settingsForPlatform() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 8,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Ride Platform Driver',
          notificationText: 'الرحلة قيد التنفيذ ويتم تحديث موقعك للمسافر.',
          notificationChannelName: 'تتبع الرحلة',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }

    if (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: 8,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }

    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 8,
    );
  }

  Map<String, dynamic> _payload(Position position) {
    return {
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracy': position.accuracy,
      'heading': position.heading,
      'speed': position.speed,
      'recordedAt': position.timestamp.toUtc().toIso8601String(),
    };
  }

  Future<void> _send(Position position) async {
    final tripId = _tripId;
    if (tripId == null || _sending) return;
    _sending = true;
    final payload = _payload(position);

    try {
      await _flushPending(tripId);
      await _deliverLocation(tripId, payload);
    } catch (_) {
      await DriverRuntimeStore.instance.enqueueLocation(payload);
    } finally {
      _sending = false;
    }
  }

  Future<void> _flushPending(String tripId) async {
    final queued = await DriverRuntimeStore.instance.pendingLocations();
    if (queued.isEmpty) return;

    // The backend stores one live point per trip, so replay only the newest
    // offline point. Older points are no longer useful for the live marker.
    await _deliverLocation(tripId, queued.last);
    await DriverRuntimeStore.instance.replacePendingLocations(const []);
  }

  Future<void> _deliverLocation(
    String tripId,
    Map<String, dynamic> payload,
  ) async {
    final realtime = await RealtimeService.instance.sendLocation(tripId, payload);
    if (realtime == RealtimeDeliveryResult.accepted ||
        realtime == RealtimeDeliveryResult.rejected) {
      return;
    }

    await ApiClient.instance.postJson<Map<String, dynamic>>(
      '/tracking/trips/$tripId/location',
      data: payload,
    );
  }
}
