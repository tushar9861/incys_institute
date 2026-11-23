import 'dart:convert';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

class InstituteApi {
  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
  static const firebaseKey = String.fromEnvironment('FIREBASE_API_KEY');
  static bool get firebaseEnabled => firebaseKey.isNotEmpty;
  final String endpoint;
  InstituteApi({this.endpoint = baseUrl});
  final storage = const FlutterSecureStorage();
  String? _token;
  StreamSubscription<String>? _pushRefresh;
  Future<Map<String, String>> _headers() async {
    final token = firebaseEnabled
        ? await FirebaseAuth.instance.currentUser?.getIdToken()
        : _token;
    return {if (token != null) 'Authorization': 'Bearer $token'};
  }

  dynamic _decode(http.Response response) {
    dynamic data;
    try {
      data = jsonDecode(response.body);
    } catch (_) {
      throw Exception(
        'The server returned an unexpected response. Please try again.',
      );
    }
    if (response.statusCode >= 400) {
      final fields = data is Map ? data['fields'] as List? : null;
      throw Exception(
        fields != null
            ? '${data['error']} ${fields.map((f) => '${f['path']}: ${f['message']}').join(' ')}'
            : data is Map
            ? data['error'] ?? 'The request could not be completed.'
            : 'The request could not be completed.',
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> uploadDocument({
    required String filename,
    required Uint8List bytes,
    required String mime,
    required String purpose,
  }) async {
    if (bytes.isEmpty || bytes.length > 10 * 1024 * 1024) {
      throw Exception('Choose a document under 10 MB.');
    }
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$endpoint/api/v1/documents'),
    );
    request.headers.addAll(await _headers());
    request.fields['purpose'] = purpose;
    request.files.add(
      http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: filename,
        contentType: MediaType.parse(mime),
      ),
    );
    final response = await request
        .send()
        .then(http.Response.fromStream)
        .timeout(const Duration(seconds: 75));
    return Map<String, dynamic>.from(_decode(response));
  }

  Future<Uint8List> downloadDocument(String id) async {
    final response = await http
        .get(
          Uri.parse('$endpoint/api/v1/documents/${Uri.encodeComponent(id)}'),
          headers: await _headers(),
        )
        .timeout(const Duration(seconds: 45));
    if (response.statusCode >= 400) _decode(response);
    return response.bodyBytes;
  }

  Future<void> initialize() async {
    if (kReleaseMode && Uri.parse(endpoint).scheme != 'https') {
      throw StateError('Release builds require an HTTPS API_BASE_URL.');
    }
    if (firebaseEnabled) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: firebaseKey,
          appId: String.fromEnvironment('FIREBASE_APP_ID'),
          messagingSenderId: String.fromEnvironment(
            'FIREBASE_MESSAGING_SENDER_ID',
          ),
          projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
        ),
      );
    } else {
      _token = await storage.read(key: 'incys_session');
    }
  }

  Future<dynamic> call(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, Uri.parse('$endpoint/api/v1/$path'));
    request.headers['Content-Type'] = 'application/json';
    request.headers.addAll(await _headers());
    if (body != null) request.body = jsonEncode(body);
    final response = await request
        .send()
        .then(http.Response.fromStream)
        .timeout(const Duration(seconds: 25));
    return _decode(response);
  }

  Future<void> signIn(String email, String password) async {
    if (firebaseEnabled) {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } else {
      final data = await call(
        'auth/login',
        method: 'POST',
        body: {'email': email, 'password': password},
      );
      _token = data['token'];
      await storage.write(key: 'incys_session', value: _token);
    }
    await call('me');
    if (firebaseEnabled) {
      try {
        await FirebaseMessaging.instance.requestPermission();
        // The backend Admin SDK currently sends to registration tokens, not FIDs.
        // ignore: deprecated_member_use
        final token = await FirebaseMessaging.instance.getToken();
        if (token != null) {
          await call('devices', method: 'POST', body: {'token': token});
          await storage.write(key: 'incys_push_token', value: token);
        }
        await _pushRefresh?.cancel();
        // ignore: deprecated_member_use
        _pushRefresh = FirebaseMessaging.instance.onTokenRefresh.listen((
          value,
        ) async {
          try {
            await call('devices', method: 'POST', body: {'token': value});
            await storage.write(key: 'incys_push_token', value: value);
          } catch (_) {
            /* Registration retries on the next sign-in. */
          }
        });
      } catch (_) {
        /* In-app notifications remain available if push is declined. */
      }
    }
  }

  Future<void> register(String name, String email, String password) async {
    if (firebaseEnabled) {
      final credential = await FirebaseAuth.instance
          .createUserWithEmailAndPassword(email: email, password: password);
      await credential.user?.updateDisplayName(name);
      await credential.user?.sendEmailVerification();
      throw Exception(
        'Verification email sent. Verify your email, then sign in.',
      );
    }
    await call(
      'auth/register',
      method: 'POST',
      body: {
        'name': name,
        'email': email,
        'password': password,
        'consent': true,
      },
    );
    await signIn(email, password);
  }

  Future<void> signOut() async {
    if (firebaseEnabled) {
      try {
        final token = await storage.read(key: 'incys_push_token');
        if (token != null) {
          await call(
            'devices/unregister',
            method: 'POST',
            body: {'token': token},
          );
        }
      } catch (_) {}
      await _pushRefresh?.cancel();
      await storage.delete(key: 'incys_push_token');
      await FirebaseAuth.instance.signOut();
    } else {
      try {
        await call('auth/logout', method: 'POST', body: {});
      } catch (_) {}
    }
    _token = null;
    await storage.delete(key: 'incys_session');
  }
}

String money(dynamic paise) => '₹${((paise as num) / 100).toStringAsFixed(2)}';
String localDate(String value) {
  final d = DateTime.parse(value).toLocal();
  return '${d.day}/${d.month}/${d.year} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
