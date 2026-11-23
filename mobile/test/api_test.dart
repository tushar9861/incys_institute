import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

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
  test('document requests use authenticated multipart upload and preserve download access errors', () async {
    FlutterSecureStorage.setMockInitialValues({
      'incys_session': 'document-session',
    });
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    var uploads = 0;
    server.listen((request) async {
      expect(request.headers.value('authorization'), 'Bearer document-session');
      if (request.method == 'POST') {
        uploads++;
        expect(request.headers.contentType!.mimeType, 'multipart/form-data');
        final body = await utf8.decoder.bind(request).join();
        expect(body, contains('name="purpose"'));
        expect(body, contains('assignment_attachment'));
        expect(body, contains('filename="work.pdf"'));
        expect(body.toLowerCase(), contains('content-type: application/pdf'));
        expect(body, contains('%PDF-1.4'));
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({'id': 'document-1', 'state': 'clean'}),
        );
      } else if (request.uri.path.endsWith('/denied')) {
        request.response.statusCode = 403;
        request.response.write(
          jsonEncode({'error': 'You cannot access this document.'}),
        );
      } else {
        request.response.headers.contentType = ContentType(
          'application',
          'pdf',
        );
        request.response.write('%PDF-1.4\nSynthetic document');
      }
      await request.response.close();
    });
    final api = InstituteApi(endpoint: 'http://127.0.0.1:${server.port}');
    await api.initialize();
    final doc = await api.uploadDocument(
      filename: 'work.pdf',
      bytes: Uint8List.fromList(utf8.encode('%PDF-1.4\nSynthetic document')),
      mime: 'application/pdf',
      purpose: 'assignment_attachment',
    );
    expect(doc['state'], 'clean');
    expect(
      utf8.decode(await api.downloadDocument(doc['id'])),
      startsWith('%PDF-1.4'),
    );
    await expectLater(
      api.downloadDocument('denied'),
      throwsA(predicate((e) => e.toString().contains('cannot access'))),
    );
    await expectLater(
      api.uploadDocument(
        filename: 'large.pdf',
        bytes: Uint8List(10 * 1024 * 1024 + 1),
        mime: 'application/pdf',
        purpose: 'patient_report',
      ),
      throwsA(predicate((e) => e.toString().contains('10 MB'))),
    );
    expect(uploads, 1);
  });
}
