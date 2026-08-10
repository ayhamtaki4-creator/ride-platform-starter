import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../core/api_client.dart';

const _firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
const _firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
const _firebaseMessagingSenderId =
    String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
const _firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

bool get _firebaseConfigured =>
    _firebaseApiKey.isNotEmpty &&
    _firebaseAppId.isNotEmpty &&
    _firebaseMessagingSenderId.isNotEmpty &&
    _firebaseProjectId.isNotEmpty;

FirebaseOptions get _firebaseOptions => FirebaseOptions(
      apiKey: _firebaseApiKey,
      appId: _firebaseAppId,
      messagingSenderId: _firebaseMessagingSenderId,
      projectId: _firebaseProjectId,
    );

@pragma('vm:entry-point')
Future<void> driverFirebaseBackgroundHandler(RemoteMessage message) async {
  if (!_firebaseConfigured) return;
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: _firebaseOptions);
  }
}

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();

  StreamSubscription<String>? _tokenSubscription;
  String? _registeredToken;
  bool _initialized = false;

  static Future<void> initializeFirebase() async {
    if (!_firebaseConfigured) return;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: _firebaseOptions);
      }
      FirebaseMessaging.onBackgroundMessage(driverFirebaseBackgroundHandler);
    } catch (_) {
      // Firebase remains optional until the deployment provides valid config.
    }
  }

  bool get configured => _firebaseConfigured && Firebase.apps.isNotEmpty;

  Future<void> activate() async {
    if (!configured) return;
    if (_initialized) return;
    _initialized = true;

    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await _registerToken(token);
      }
      _tokenSubscription = FirebaseMessaging.instance.onTokenRefresh.listen(
        (token) => unawaited(_registerToken(token)),
      );
    } catch (_) {
      _initialized = false;
    }
  }

  Future<void> deactivate() async {
    await _tokenSubscription?.cancel();
    _tokenSubscription = null;
    final token = _registeredToken;
    _registeredToken = null;
    _initialized = false;
    if (token == null || token.isEmpty) return;

    try {
      await ApiClient.instance.deleteJson<Map<String, dynamic>>(
        '/mobile-push/devices',
        data: {'token': token},
      );
    } catch (_) {
      // Logging out should not fail because push cleanup could not reach the API.
    }
  }

  Future<void> _registerToken(String token) async {
    if (token == _registeredToken) return;
    final platform = kIsWeb
        ? 'WEB'
        : Platform.isIOS
            ? 'IOS'
            : 'ANDROID';
    if (platform == 'WEB') return;

    await ApiClient.instance.postJson<Map<String, dynamic>>(
      '/mobile-push/devices',
      data: {
        'token': token,
        'platform': platform,
      },
    );
    _registeredToken = token;
  }
}
