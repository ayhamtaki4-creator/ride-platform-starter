import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../services/realtime_service.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];
  StreamSubscription<Map<String, dynamic>>? _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = RealtimeService.instance.notificationEvents.listen((event) {
      if (!mounted) return;
      setState(() {
        _items = [event, ..._items.where((item) => item['id'] != event['id'])];
      });
    });
    unawaited(RealtimeService.instance.ensureConnected());
    _load();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiClient.instance.getJson<Map<String, dynamic>>('/notifications?limit=50');
      final raw = data['items'];
      final items = raw is List
          ? raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() => _items = items);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (item['readAt'] != null) return;
    final id = item['id']?.toString();
    if (id == null || id.isEmpty) return;
    try {
      await ApiClient.instance.patchJson<Map<String, dynamic>>('/notifications/$id/read');
      if (!mounted) return;
      setState(() {
        item['readAt'] = DateTime.now().toUtc().toIso8601String();
      });
    } catch (_) {}
  }

  Future<void> _markAllRead() async {
    try {
      await ApiClient.instance.patchJson<Map<String, dynamic>>('/notifications/read-all');
      final now = DateTime.now().toUtc().toIso8601String();
      if (!mounted) return;
      setState(() {
        for (final item in _items) {
          item['readAt'] ??= now;
        }
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الإشعارات'),
        actions: [
          IconButton(
            tooltip: 'تحديد الكل كمقروء',
            onPressed: _items.any((item) => item['readAt'] == null) ? _markAllRead : null,
            icon: const Icon(Icons.done_all_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading && _items.isEmpty) {
      return ListView(children: const [SizedBox(height: 220), Center(child: CircularProgressIndicator())]);
    }
    if (_error != null && _items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 120),
          const Icon(Icons.notifications_off_outlined, size: 56),
          const SizedBox(height: 16),
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: _load, child: const Text('إعادة المحاولة')),
        ],
      );
    }
    if (_items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          SizedBox(height: 120),
          Icon(Icons.notifications_none_rounded, size: 64),
          SizedBox(height: 16),
          Text('لا توجد إشعارات بعد.', textAlign: TextAlign.center),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = _items[index];
        final unread = item['readAt'] == null;
        return Card(
          child: ListTile(
            onTap: () => _markRead(item),
            leading: Icon(unread ? Icons.notifications_active_rounded : Icons.notifications_none_rounded),
            title: Text(
              item['title']?.toString() ?? 'إشعار',
              style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w600),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(item['message']?.toString() ?? ''),
            ),
            trailing: unread
                ? Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary,
                      shape: BoxShape.circle,
                    ),
                  )
                : null,
          ),
        );
      },
    );
  }
}
