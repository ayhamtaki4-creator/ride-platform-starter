import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../models/driver_trip.dart';
import '../services/location_tracking_service.dart';

class TripDetailPage extends StatefulWidget {
  const TripDetailPage({super.key, required this.trip});

  final DriverTrip trip;

  @override
  State<TripDetailPage> createState() => _TripDetailPageState();
}

class _TripDetailPageState extends State<TripDetailPage> {
  late DriverTrip _trip;
  bool _working = false;
  String? _message;
  String? _error;

  @override
  void initState() {
    super.initState();
    _trip = widget.trip;
    if (_trip.shouldTrackLocation) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _ensureTracking());
    }
  }

  Future<void> _reload() async {
    final data = await ApiClient.instance.getJson<List<dynamic>>('/drivers/me/schedule');
    for (final item in data.whereType<Map>()) {
      final trip = DriverTrip.fromJson(Map<String, dynamic>.from(item));
      if (trip.id == _trip.id) {
        if (mounted) setState(() => _trip = trip);
        return;
      }
    }
  }

  Future<void> _request(
    String path, {
    Object? data,
    String? success,
    bool startTracking = false,
    bool stopTracking = false,
  }) async {
    if (_working) return;
    setState(() {
      _working = true;
      _message = null;
      _error = null;
    });

    try {
      await ApiClient.instance.postJson<dynamic>(path, data: data);
      await _reload();
      if (startTracking) await _ensureTracking(showSuccess: false);
      if (stopTracking) await LocationTrackingService.instance.stop();
      if (!mounted) return;
      setState(() => _message = success ?? 'تم تحديث الرحلة.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _ensureTracking({bool showSuccess = true}) async {
    try {
      await LocationTrackingService.instance.start(_trip.id);
      if (!mounted || !showSuccess) return;
      setState(() {
        _error = null;
        _message = 'GPS يعمل الآن وسيستمر أثناء وجود الرحلة في الحالة النشطة.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = apiErrorMessage(error));
    }
  }

  Future<void> _rejectAssignment() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('رفض المهمة'),
        content: TextField(
          controller: controller,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'سبب الرفض',
            hintText: 'اكتب سببًا واضحًا للإدارة',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.length >= 3) Navigator.pop(context, value);
            },
            child: const Text('تأكيد الرفض'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason == null || reason.isEmpty) return;
    await _request(
      '/drivers/me/bookings/${_trip.id}/reject',
      data: {'reason': reason},
      success: 'تم رفض المهمة وإعادتها للإدارة.',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_trip.bookingReference)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          tripStatusLabel(_trip.status),
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                        ),
                      ),
                      if (LocationTrackingService.instance.activeTripId == _trip.id)
                        const Chip(
                          avatar: Icon(Icons.gps_fixed_rounded, size: 18),
                          label: Text('GPS يعمل'),
                        ),
                    ],
                  ),
                  const Divider(height: 28),
                  _detail(Icons.trip_origin_rounded, 'الانطلاق', _trip.pickupAddress),
                  const SizedBox(height: 14),
                  _detail(Icons.location_on_rounded, 'الوجهة', _trip.dropoffAddress),
                  const SizedBox(height: 14),
                  _detail(Icons.person_rounded, 'المسافر', _trip.contactName ?? '—'),
                  if (_trip.contactPhone?.isNotEmpty == true) ...[
                    const SizedBox(height: 14),
                    _detail(Icons.phone_rounded, 'رقم الهاتف', _trip.contactPhone!),
                  ],
                  const SizedBox(height: 14),
                  _detail(
                    Icons.groups_rounded,
                    'الحمولة',
                    '${_trip.passengerCount} ركاب · ${_trip.luggageCount} حقائب',
                  ),
                  if (_trip.flightNumber?.isNotEmpty == true) ...[
                    const SizedBox(height: 14),
                    _detail(
                      Icons.flight_rounded,
                      'الطائرة',
                      '${_trip.flightNumber}${_trip.flightArrivalTime?.isNotEmpty == true ? ' · ${_trip.flightArrivalTime}' : ''}',
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_message != null) ...[
            const SizedBox(height: 12),
            _notice(_message!, false),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            _notice(_error!, true),
          ],
          const SizedBox(height: 18),
          ..._actions(),
        ],
      ),
    );
  }

  List<Widget> _actions() {
    final actions = <Widget>[];

    if (_trip.driverAssignmentStatus == 'PENDING' && _trip.status == 'DRIVER_ASSIGNED') {
      actions.add(
        FilledButton.icon(
          onPressed: _working
              ? null
              : () => _request(
                    '/drivers/me/bookings/${_trip.id}/accept',
                    success: 'تم قبول المهمة.',
                  ),
          icon: const Icon(Icons.check_circle_rounded),
          label: const Text('قبول المهمة'),
        ),
      );
      actions.add(const SizedBox(height: 10));
      actions.add(
        OutlinedButton.icon(
          onPressed: _working ? null : _rejectAssignment,
          icon: const Icon(Icons.close_rounded),
          label: const Text('رفض المهمة'),
        ),
      );
      return actions;
    }

    if (_trip.driverAssignmentStatus == 'ACCEPTED' && _trip.status == 'DRIVER_ASSIGNED') {
      actions.add(
        FilledButton.icon(
          onPressed: _working
              ? null
              : () => _request(
                    '/trips/${_trip.id}/arriving',
                    success: 'تم إبلاغ المسافر أنك في الطريق.',
                  ),
          icon: const Icon(Icons.directions_car_filled_rounded),
          label: const Text('أنا في الطريق'),
        ),
      );
    } else if (_trip.status == 'DRIVER_ARRIVING') {
      actions.add(
        FilledButton.icon(
          onPressed: _working
              ? null
              : () => _request(
                    '/trips/${_trip.id}/arrived',
                    success: 'تم تسجيل الوصول وبدأ تتبع الموقع.',
                    startTracking: true,
                  ),
          icon: const Icon(Icons.location_on_rounded),
          label: const Text('وصلت إلى المسافر'),
        ),
      );
    } else if (_trip.status == 'DRIVER_ARRIVED') {
      actions.add(
        FilledButton.icon(
          onPressed: _working
              ? null
              : () => _request(
                    '/trips/${_trip.id}/start',
                    success: 'تم بدء الرحلة.',
                    startTracking: true,
                  ),
          icon: const Icon(Icons.play_arrow_rounded),
          label: const Text('بدء الرحلة'),
        ),
      );
      actions.add(const SizedBox(height: 10));
      actions.add(
        OutlinedButton.icon(
          onPressed: _working ? null : _ensureTracking,
          icon: const Icon(Icons.gps_fixed_rounded),
          label: const Text('تشغيل GPS الآن'),
        ),
      );
    } else if (_trip.status == 'IN_PROGRESS') {
      actions.add(
        FilledButton.icon(
          onPressed: _working
              ? null
              : () => _request(
                    '/trips/${_trip.id}/complete',
                    data: {'note': 'Completed from driver mobile app'},
                    success: 'تم إنهاء الرحلة وإيقاف التتبع.',
                    stopTracking: true,
                  ),
          icon: const Icon(Icons.flag_rounded),
          label: const Text('إنهاء الرحلة'),
        ),
      );
      actions.add(const SizedBox(height: 10));
      actions.add(
        OutlinedButton.icon(
          onPressed: _working ? null : _ensureTracking,
          icon: const Icon(Icons.gps_fixed_rounded),
          label: const Text('التأكد من تشغيل GPS'),
        ),
      );
    }

    return actions;
  }

  Widget _detail(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _notice(String message, bool error) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: error ? scheme.errorContainer : scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(message),
    );
  }
}
