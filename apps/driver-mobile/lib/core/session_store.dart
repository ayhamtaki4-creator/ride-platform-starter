import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionStore {
  SessionStore._();

  static final SessionStore instance = SessionStore._();

  static const _accessTokenKey = 'ride_driver_access_token';
  static const _refreshTokenKey = 'ride_driver_refresh_token';
  static const _userKey = 'ride_driver_user';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<String?> get accessToken => _storage.read(key: _accessTokenKey);
  Future<String?> get refreshToken => _storage.read(key: _refreshTokenKey);

  Future<Map<String, dynamic>?> get user async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null || raw.isEmpty) return null;
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return null;
    return Map<String, dynamic>.from(decoded);
  }

  Future<bool> get hasSession async {
    final token = await accessToken;
    return token != null && token.isNotEmpty;
  }

  Future<void> saveSession({
    required String accessToken,
    String? refreshToken,
    required Map<String, dynamic> user,
  }) async {
    await _storage.write(key: _accessTokenKey, value: accessToken);
    if (refreshToken != null && refreshToken.isNotEmpty) {
      await _storage.write(key: _refreshTokenKey, value: refreshToken);
    }
    await _storage.write(key: _userKey, value: jsonEncode(user));
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userKey),
    ]);
  }
}
