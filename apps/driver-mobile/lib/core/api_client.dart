import 'package:dio/dio.dart';

import 'app_config.dart';
import 'session_store.dart';

class ApiClient {
  ApiClient._()
      : _dio = Dio(
          BaseOptions(
            baseUrl: AppConfig.apiBaseUrl,
            connectTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(seconds: 25),
            sendTimeout: const Duration(seconds: 20),
            headers: const {'Content-Type': 'application/json'},
          ),
        ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await SessionStore.instance.accessToken;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final request = error.requestOptions;
          final shouldRefresh =
              error.response?.statusCode == 401 &&
              request.extra['retriedAfterRefresh'] != true &&
              !request.path.endsWith('/auth/login') &&
              !request.path.endsWith('/auth/refresh');

          if (!shouldRefresh) {
            handler.next(error);
            return;
          }

          try {
            final refreshed = await _refreshSession();
            if (!refreshed) {
              handler.next(error);
              return;
            }

            final accessToken = await SessionStore.instance.accessToken;
            request.extra['retriedAfterRefresh'] = true;
            request.headers['Authorization'] = 'Bearer $accessToken';
            final response = await _dio.fetch<dynamic>(request);
            handler.resolve(response);
          } catch (_) {
            handler.next(error);
          }
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._();

  final Dio _dio;
  Future<bool>? _refreshInFlight;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email.trim(), 'password': password},
      options: Options(extra: {'retriedAfterRefresh': true}),
    );

    final data = response.data ?? <String, dynamic>{};
    final accessToken = data['accessToken']?.toString();
    final refreshToken = data['refreshToken']?.toString();
    final rawUser = data['user'];
    if (accessToken == null || accessToken.isEmpty || rawUser is! Map) {
      throw StateError('استجابة تسجيل الدخول غير مكتملة.');
    }

    final user = Map<String, dynamic>.from(rawUser);
    final roles = (user['roles'] as List?)?.map((item) => item.toString()).toSet() ?? <String>{};
    if (!roles.contains('DRIVER')) {
      throw StateError('هذا الحساب ليس حساب سائق.');
    }

    await SessionStore.instance.saveSession(
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: user,
    );
    return user;
  }

  Future<void> logout() async {
    final refreshToken = await SessionStore.instance.refreshToken;
    try {
      await _dio.post<void>(
        '/auth/logout',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'retriedAfterRefresh': true}),
      );
    } catch (_) {
      // Local logout must still succeed when the network is unavailable.
    } finally {
      await SessionStore.instance.clear();
    }
  }

  Future<T> getJson<T>(String path) async {
    final response = await _dio.get<T>(path);
    return response.data as T;
  }

  Future<T> postJson<T>(String path, {Object? data}) async {
    final response = await _dio.post<T>(path, data: data);
    return response.data as T;
  }

  Future<bool> _refreshSession() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final future = _performRefresh();
    _refreshInFlight = future;
    return future.whenComplete(() => _refreshInFlight = null);
  }

  Future<bool> _performRefresh() async {
    final refreshToken = await SessionStore.instance.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      await SessionStore.instance.clear();
      return false;
    }

    final bareDio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 25),
        headers: const {'Content-Type': 'application/json'},
      ),
    );

    try {
      final response = await bareDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final data = response.data ?? <String, dynamic>{};
      final accessToken = data['accessToken']?.toString();
      final nextRefreshToken = data['refreshToken']?.toString();
      final rawUser = data['user'];
      if (accessToken == null || rawUser is! Map) return false;

      await SessionStore.instance.saveSession(
        accessToken: accessToken,
        refreshToken: nextRefreshToken ?? refreshToken,
        user: Map<String, dynamic>.from(rawUser),
      );
      return true;
    } catch (_) {
      await SessionStore.instance.clear();
      return false;
    }
  }
}

String apiErrorMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['message'] != null) {
      final message = data['message'];
      if (message is List) return message.join('\n');
      return message.toString();
    }
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return 'انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.';
    }
    if (error.type == DioExceptionType.connectionError) {
      return 'تعذر الاتصال بالخادم. تحقق من الإنترنت.';
    }
  }
  if (error is StateError) return error.message;
  return 'حدث خطأ غير متوقع.';
}
