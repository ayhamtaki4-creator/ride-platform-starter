import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class DriverRuntimeStore {
  DriverRuntimeStore._();

  static final DriverRuntimeStore instance = DriverRuntimeStore._();

  static const _activeTripKey = 'driver_active_trip_id';
  static const _pendingLocationsKey = 'driver_pending_locations';
  static const _maxPendingLocations = 20;

  final SharedPreferencesAsync _prefs = SharedPreferencesAsync();

  Future<String?> get activeTripId => _prefs.getString(_activeTripKey);

  Future<void> setActiveTrip(String tripId) async {
    await _prefs.setString(_activeTripKey, tripId);
  }

  Future<void> clearActiveTrip() async {
    await _prefs.remove(_activeTripKey);
  }

  Future<void> enqueueLocation(Map<String, dynamic> payload) async {
    final queued = await pendingLocations();
    queued.add(payload);
    final trimmed = queued.length > _maxPendingLocations
        ? queued.sublist(queued.length - _maxPendingLocations)
        : queued;
    await _prefs.setString(
      _pendingLocationsKey,
      jsonEncode(trimmed),
    );
  }

  Future<List<Map<String, dynamic>>> pendingLocations() async {
    final raw = await _prefs.getString(_pendingLocationsKey);
    if (raw == null || raw.isEmpty) return <Map<String, dynamic>>[];

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <Map<String, dynamic>>[];
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  Future<void> replacePendingLocations(
    List<Map<String, dynamic>> locations,
  ) async {
    if (locations.isEmpty) {
      await _prefs.remove(_pendingLocationsKey);
      return;
    }
    await _prefs.setString(_pendingLocationsKey, jsonEncode(locations));
  }

  Future<void> clearAll() async {
    await Future.wait([
      _prefs.remove(_activeTripKey),
      _prefs.remove(_pendingLocationsKey),
    ]);
  }
}
