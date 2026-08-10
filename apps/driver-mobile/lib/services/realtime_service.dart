import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/app_config.dart';
import '../core/session_store.dart';

enum RealtimeDeliveryResult {
  accepted,
  rejected,
  unavailable,
}

class RealtimeService {
  RealtimeService._();

  static final RealtimeService instance = RealtimeService._();

  io.Socket? _socket;
  String? _token;
  Future<bool>? _connecting;

  final StreamController<Map<String, dynamic>> _tripEvents =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _locationEvents =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _notificationEvents =
      StreamController<Map<String, dynamic>>.broadcast();
  final Map<String, Completer<RealtimeDeliveryResult>> _locationAcks = {};

  Stream<Map<String, dynamic>> get tripEvents => _tripEvents.stream;
  Stream<Map<String, dynamic>> get locationEvents => _locationEvents.stream;
  Stream<Map<String, dynamic>> get notificationEvents => _notificationEvents.stream;
  bool get connected => _socket?.connected == true;

  Future<bool> ensureConnected() async {
    final accessToken = await SessionStore.instance.accessToken;
    if (accessToken == null || accessToken.isEmpty) return false;

    if (_socket?.connected == true && _token == accessToken) return true;

    final existing = _connecting;
    if (existing != null) return existing;

    final future = _connect(accessToken);
    _connecting = future;
    try {
      return await future;
    } finally {
      _connecting = null;
    }
  }

  Future<bool> _connect(String accessToken) async {
    disconnect();
    _token = accessToken;

    final ready = Completer<bool>();
    final socket = io.io(
      AppConfig.realtimeUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(12)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setTimeout(8000)
          .setAuth({'token': accessToken})
          .build(),
    );
    _socket = socket;

    void finishReady(bool result) {
      if (!ready.isCompleted) ready.complete(result);
    }

    socket.on('realtime.ready', (_) => finishReady(true));
    socket.on('realtime.auth.error', (_) => finishReady(false));
    socket.onConnectError((_) => finishReady(false));
    socket.onError((_) {
      if (!socket.connected) finishReady(false);
    });

    socket.on('trip.location.accepted', _handleLocationAck);
    socket.on('trip.location.updated', _forwardLocation);
    socket.on('driver.trip.assigned', _forwardTrip);
    socket.on('driver.trip.updated', _forwardTrip);
    socket.on('driver.trip.unassigned', _forwardTrip);
    socket.on('trip.status.updated', _forwardTrip);
    socket.on('notification.created', _forwardNotification);

    socket.connect();

    try {
      final result = await ready.future.timeout(
        const Duration(seconds: 8),
        onTimeout: () => false,
      );
      if (!result && !socket.connected) return false;
      return result || socket.connected;
    } catch (_) {
      return false;
    }
  }

  Future<RealtimeDeliveryResult> sendLocation(
    String tripId,
    Map<String, dynamic> payload,
  ) async {
    final isConnected = await ensureConnected();
    final socket = _socket;
    if (!isConnected || socket == null || !socket.connected) {
      return RealtimeDeliveryResult.unavailable;
    }

    final recordedAt = payload['recordedAt']?.toString();
    if (recordedAt == null || recordedAt.isEmpty) {
      return RealtimeDeliveryResult.unavailable;
    }

    final key = _ackKey(tripId, recordedAt);
    final previous = _locationAcks.remove(key);
    if (previous != null && !previous.isCompleted) {
      previous.complete(RealtimeDeliveryResult.unavailable);
    }

    final completer = Completer<RealtimeDeliveryResult>();
    _locationAcks[key] = completer;
    socket.emit('trip.location.update', {
      'tripId': tripId,
      ...payload,
    });

    try {
      return await completer.future.timeout(
        const Duration(seconds: 4),
        onTimeout: () => RealtimeDeliveryResult.unavailable,
      );
    } finally {
      _locationAcks.remove(key);
    }
  }

  Future<bool> subscribeTrip(String tripId) async {
    if (!await ensureConnected()) return false;
    final socket = _socket;
    if (socket == null || !socket.connected) return false;
    socket.emit('trip.subscribe', {'tripId': tripId});
    return true;
  }

  void _handleLocationAck(Object? raw) {
    final data = _map(raw);
    if (data == null) return;
    final tripId = data['tripId']?.toString();
    final recordedAt = data['recordedAt']?.toString();
    if (tripId == null || recordedAt == null) return;

    final completer = _locationAcks[_ackKey(tripId, recordedAt)];
    if (completer == null || completer.isCompleted) return;

    final rejected = data['throttled'] == true ||
        data['accepted'] == false ||
        data['ignoredStale'] == true;
    completer.complete(
      rejected
          ? RealtimeDeliveryResult.rejected
          : RealtimeDeliveryResult.accepted,
    );
  }

  void _forwardTrip(Object? raw) {
    final data = _map(raw);
    if (data != null) _tripEvents.add(data);
  }

  void _forwardLocation(Object? raw) {
    final data = _map(raw);
    if (data != null) _locationEvents.add(data);
  }

  void _forwardNotification(Object? raw) {
    final data = _map(raw);
    if (data != null) _notificationEvents.add(data);
  }

  Map<String, dynamic>? _map(Object? raw) {
    if (raw is! Map) return null;
    return Map<String, dynamic>.from(raw);
  }

  String _ackKey(String tripId, String recordedAt) => '$tripId|$recordedAt';

  void disconnect() {
    final socket = _socket;
    _socket = null;
    _token = null;
    socket?.disconnect();
    socket?.dispose();

    for (final completer in _locationAcks.values) {
      if (!completer.isCompleted) {
        completer.complete(RealtimeDeliveryResult.unavailable);
      }
    }
    _locationAcks.clear();
  }
}
