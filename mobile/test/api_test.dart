import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:incys_mobile/api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // These are loopback integration tests; Flutter's widget binding normally
  // replaces every HTTP response with an empty 400 response.
  HttpOverrides.global = null;
  test('native sign-in persists a session, authorizes requests and clears it on sign-out', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final received = <String>[];
    server.listen((request) async {
      final body = await utf8.decoder.bind(request).join();
      request.response.headers.contentType = ContentType.json;
      if (request.uri.path.endsWith('/auth/login')) {
        expect(jsonDecode(body)['email'], 'student@test.invalid');
        request.response.write(jsonEncode({'token': 'test-session'}));
      } else {
        received.add(request.headers.value('authorization') ?? '');
        request.response.write(jsonEncode({'id': 'student'}));
      }
      await request.response.close();
    });
    final api = InstituteApi(endpoint: 'http://127.0.0.1:${server.port}');
    await api.initialize();
    await api.signIn('student@test.invalid', 'test-password');
    expect(await api.storage.read(key: 'incys_session'), 'test-session');
    final restored = InstituteApi(endpoint: api.endpoint);
    await restored.initialize();
    await restored.call('me');
    expect(received, everyElement('Bearer test-session'));
    await restored.signOut();
    expect(await api.storage.read(key: 'incys_session'), isNull);
  });
  test('permission failures surface to the native caller', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((request) async {
      request.response.statusCode = 403;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({'error': 'Access is restricted.'}));
      await request.response.close();
    });
    final api = InstituteApi(endpoint: 'http://127.0.0.1:${server.port}');
    await api.initialize();
    await expectLater(
      api.call('workspace'),
      throwsA(predicate((e) => e.toString().contains('Access is restricted.'))),
    );
  });
}
