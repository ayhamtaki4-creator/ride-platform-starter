import 'dart:io';

import 'package:url_launcher/url_launcher.dart';

class ExternalNavigation {
  const ExternalNavigation._();

  static Future<void> openDestination({
    required double latitude,
    required double longitude,
  }) async {
    final Uri uri;
    if (Platform.isIOS || Platform.isMacOS) {
      uri = Uri.https('maps.apple.com', '/', {
        'daddr': '$latitude,$longitude',
        'dirflg': 'd',
      });
    } else {
      uri = Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'destination': '$latitude,$longitude',
        'travelmode': 'driving',
      });
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened) {
      throw StateError('تعذر فتح تطبيق الخرائط على هذا الجهاز.');
    }
  }

  static Future<void> call(String phone) async {
    final normalized = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    final opened = await launchUrl(Uri.parse('tel:$normalized'));
    if (!opened) {
      throw StateError('تعذر فتح تطبيق الاتصال.');
    }
  }
}
