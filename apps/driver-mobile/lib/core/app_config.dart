class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://ride-platform-starter.onrender.com/api',
  );

  static String get realtimeUrl {
    const override = String.fromEnvironment('REALTIME_URL');
    if (override.trim().isNotEmpty) return override.trim();

    final apiUri = Uri.parse(apiBaseUrl);
    final segments = apiUri.pathSegments.where((segment) => segment.isNotEmpty).toList();
    if (segments.isNotEmpty && segments.last == 'api') segments.removeLast();
    final basePath = segments.isEmpty ? '' : '/${segments.join('/')}';
    return apiUri
        .replace(
          path: '$basePath/realtime',
          query: null,
          fragment: null,
        )
        .toString();
  }
}
