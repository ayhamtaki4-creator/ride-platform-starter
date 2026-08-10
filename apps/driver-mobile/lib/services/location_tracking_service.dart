import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../core/api_client.dart';

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
    await stop();

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
    final settings = _settingsForPlatform();
    _subscription = Geolocator.getPositionStream(locationSettings: settings).listen(
      (position) {
        _lastPosition = position;
        unawaited(_send(position));
      },
      onError: (_) {
        // The UI can inspect isRunning and restart after permissions/network recover.
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

  Future<void> stop() async {
    _heartbeat?.cancel();
    _heartbeat = null;
    await _subscription?.cancel();
    _subscription = null;
    _tripId = null;
    _lastPosition = null;
    _sending = false;
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

  Future<void> _send(Position position) async {
    final tripId = _tripId;
    if (tripId == null || _sending) return;
    _sending = true;

    try {
      await ApiClient.instance.postJson<Map<String, dynamic>>(
        '/tracking/trips/$tripId/location',
        data: {
          'latitude': position.latitude,
          'longitude': position.longitude,
          'accuracy': position.accuracy,
          'heading': position.heading,
          'speed': position.speed,
          'recordedAt': position.timestamp.toUtc().toIso8601String(),
        },
      );
    } catch (_) {
      // Keep the most recent device position in memory. The stream or heartbeat
      // will retry after connectivity returns; the API already rejects stale data.
    } finally {
      _sending = false;
    }
  }
}
