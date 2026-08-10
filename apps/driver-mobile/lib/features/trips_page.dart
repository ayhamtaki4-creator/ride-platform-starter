import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/driver_runtime_store.dart';
import '../models/driver_trip.dart';
import '../services/location_tracking_service.dart';
import '../services/realtime_service.dart';
import 'login_page.dart';
import 'trip_detail_page.dart';

class TripsPage extends StatefulWidget {
  const TripsPage({super.key});

  @override
  State<TripsPage> createState() => _TripsPageState();
}

class _TripsPageState extends State<TripsPage> {
  bool _loading = true;
  String? _error;
  List<DriverTrip> _trips = const [];
  StreamSubscription<Map<String, dynamic>>? _tripEvents;
  StreamSubscription<Map<String, dynamic>>? _notificationEvents;
  Timer? _realtimeReloadTimer;

  @override
  void initState() {
    super.initState();
    _tripEvents = RealtimeService.instance.tripEvents.listen((_) {
      _scheduleRealtimeReload();
    });
    _notificationEvents = RealtimeService.instance.notificationEvents.listen(
      _showRealtimeNotification,
    );
    unawaited(RealtimeService.instance.ensureConnected());
    _load();
  }

  @override
  void dispose() {
    _realtimeReloadTimer?.cancel();
    _tripEvents?.cancel();
    _notificationEvents?.cancel();
    super.dispose();
  }

  void _scheduleRealtimeReload() {
    _realtimeReloadTimer?.cancel();
    _realtimeReloadTimer = Timer(const Duration(milliseconds: 450), () {
      if (mounted) unawaited(_loadTrips(showLoading: false));
    });
  }

  void _showRealtimeNotification(Map<String, dynamic> event) {
    if (!mounted) return;
    final title = event['title']?.toString().trim();
    final message = event['message']?.toString().trim();
    final text = [
      if (title != null && title.isNotEmpty) title,
      if (message != null && message.isNotEmpty) message,
    ].join('\n');
    if (text.isEmpty) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(text),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  Future<void> _load() => _loadTrips(showLoading: true);

  Future<void> _loadTrips({required bool showLoading}) async {
    if (showLoading && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final data = await ApiClient.instance.getJson<List<dynamic>>('/drivers/me/schedule');
      final trips = data
          .whereType<Map>()
          .map((item) => DriverTrip.fromJson(Map<String, dynamic>.from(item)))
          .where((trip) => !trip.isFinished)
          .toList();

      if (!mounted) return;
      setState(() {
        _trips = trips;
        _error = null;
      });
      await _recoverTracking(trips);
    } catch (error) {
      if (!mounted) return;
      if (showLoading || _trips.isEmpty) {
        setState(() => _error = apiErrorMessage(error));
      }
    } finally {
      if (showLoading && mounted) setState(() => _loading = false);
    }
  }

  Future<void> _recoverTracking(List<DriverTrip> trips) async {
    final persistedTripId = await DriverRuntimeStore.instance.activeTripId;
    DriverTrip? trackingTrip;

    if (persistedTripId != null) {
      trackingTrip = trips
          .where((trip) => trip.id == persistedTripId && trip.shouldTrackLocation)
          .firstOrNull;
      if (trackingTrip == null) {
        await DriverRuntimeStore.instance.clearActiveTrip();
      }
    }

    trackingTrip ??= trips.where((trip) => trip.shouldTrackLocation).firstOrNull;
    if (trackingTrip == null ||
        LocationTrackingService.instance.activeTripId == trackingTrip.id) {
      return;
    }

    try {
      await LocationTrackingService.instance.start(trackingTrip.id);
    } catch (_) {
      // Permission and GPS guidance is shown in trip details when the driver opens it.
    }
  }

  Future<void> _logout() async {
    await LocationTrackingService.instance.stop();
    RealtimeService.instance.disconnect();
    await DriverRuntimeStore.instance.clearAll();
    await ApiClient.instance.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => const LoginPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('رحلاتي'),
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading && _trips.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 240),
          Center(child: CircularProgressIndicator()),
        ],
      );
    }

    if (_error != null && _trips.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 120),
          const Icon(Icons.cloud_off_rounded, size: 56),
          const SizedBox(height: 16),
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: _load, child: const Text('إعادة المحاولة')),
        ],
      );
    }

    if (_trips.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          SizedBox(height: 120),
          Icon(Icons.event_available_rounded, size: 64),
          SizedBox(height: 16),
          Text('لا توجد رحلات حالية.', textAlign: TextAlign.center),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _trips.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final trip = _trips[index];
        return Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => TripDetailPage(trip: trip),
                ),
              );
              await _load();
            },
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          trip.bookingReference,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                        ),
                      ),
                      Chip(label: Text(tripStatusLabel(trip.status))),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _row(Icons.trip_origin_rounded, trip.pickupAddress),
                  const SizedBox(height: 8),
                  _row(Icons.location_on_rounded, trip.dropoffAddress),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      Text('${trip.passengerCount} ركاب'),
                      Text('${trip.luggageCount} حقائب'),
                      if (trip.travelDate != null) Text(_date(trip.travelDate!)),
                      if (trip.flightArrivalTime?.isNotEmpty == true)
                        Text(trip.flightArrivalTime!),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _row(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(text)),
      ],
    );
  }

  String _date(DateTime value) {
    final local = value.toLocal();
    return '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
