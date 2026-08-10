import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/api_client.dart';
import '../models/driver_trip.dart';

class TripMapPage extends StatefulWidget {
  const TripMapPage({super.key, required this.trip});

  final DriverTrip trip;

  @override
  State<TripMapPage> createState() => _TripMapPageState();
}

class _TripMapPageState extends State<TripMapPage> {
  bool _loading = true;
  String? _error;
  LatLng? _driver;
  List<LatLng> _route = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final data = await ApiClient.instance.getJson<Map<String, dynamic>>(
        '/tracking/trips/${widget.trip.id}',
      );
      final live = data['liveLocation'];
      final routePlan = data['routePlan'];
      final driver = live is Map
          ? LatLng(
              _double(live['latitude']),
              _double(live['longitude']),
            )
          : null;
      final route = _readRoute(routePlan);

      if (!mounted) return;
      setState(() {
        _driver = driver;
        _route = route;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<LatLng> _readRoute(Object? routePlan) {
    if (routePlan is! Map) return const [];
    final geometry = routePlan['geometry'];
    if (geometry is! Map || geometry['type'] != 'LineString') return const [];
    final coordinates = geometry['coordinates'];
    if (coordinates is! List) return const [];

    return coordinates
        .whereType<List>()
        .where((item) => item.length >= 2)
        .map((item) => LatLng(_double(item[1]), _double(item[0])))
        .where((point) => point.latitude.abs() <= 90 && point.longitude.abs() <= 180)
        .toList();
  }

  double _double(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    final pickup = LatLng(
      widget.trip.pickupLatitude,
      widget.trip.pickupLongitude,
    );
    final dropoff = LatLng(
      widget.trip.dropoffLatitude,
      widget.trip.dropoffLongitude,
    );
    final center = _driver ?? pickup;

    return Scaffold(
      appBar: AppBar(
        title: const Text('خريطة الرحلة'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: center,
              initialZoom: _driver == null ? 10 : 13,
            ),
            children: [
              TileLayer(
                urlTemplate: const String.fromEnvironment(
                  'MAP_TILE_URL',
                  defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                ),
                userAgentPackageName: 'com.rideplatform.driver',
              ),
              if (_route.length >= 2)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: _route,
                      strokeWidth: 5,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: pickup,
                    width: 48,
                    height: 48,
                    child: const Icon(
                      Icons.trip_origin_rounded,
                      size: 34,
                    ),
                  ),
                  Marker(
                    point: dropoff,
                    width: 48,
                    height: 48,
                    child: const Icon(
                      Icons.location_on_rounded,
                      size: 38,
                    ),
                  ),
                  if (_driver != null)
                    Marker(
                      point: _driver!,
                      width: 54,
                      height: 54,
                      child: Card(
                        shape: const CircleBorder(),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(
                            Icons.directions_car_filled_rounded,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              RichAttributionWidget(
                attributions: const [
                  TextSourceAttribution('OpenStreetMap contributors'),
                ],
              ),
            ],
          ),
          if (_loading)
            const Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: LinearProgressIndicator(),
            ),
          if (_error != null)
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(12),
                color: Theme.of(context).colorScheme.errorContainer,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(_error!),
                ),
              ),
            ),
          Positioned(
            bottom: 18,
            left: 18,
            right: 18,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.gps_fixed_rounded),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _driver == null
                            ? 'بانتظار أول موقع مباشر من السائق.'
                            : 'آخر موقع مباشر تم استلامه من الخادم.',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
