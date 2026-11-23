import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import 'api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = InstituteApi();
  try {
    await api.initialize();
    runApp(IncysApp(api: api));
  } catch (_) {
    runApp(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: EdgeInsets.all(30),
              child: Text(
                'This build needs its secure connection settings. Contact the institute for a configured app.',
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class IncysApp extends StatelessWidget {
  const IncysApp({super.key, required this.api});
  final InstituteApi api;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'INCYS',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff205c46)),
      scaffoldBackgroundColor: const Color(0xfff5f7f5),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
        filled: true,
        fillColor: Colors.white,
      ),
    ),
    home: InstituteHome(api: api),
  );
}

class InstituteHome extends StatefulWidget {
  const InstituteHome({super.key, required this.api});
  final InstituteApi api;
  @override
  State<InstituteHome> createState() => _InstituteHomeState();
}

class _InstituteHomeState extends State<InstituteHome> {
  Map<String, dynamic>? data, catalog, detail;
  bool loading = true, busy = false, demo = false, registering = false;
  bool accountConsent = false;
  String? error;
  int tab = 0;
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController();
  final cart = <String, int>{};
  late final Razorpay razorpay;
  @override
  void initState() {
    super.initState();
    razorpay = Razorpay();
    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      message('Payment submitted. Awaiting provider verification.');
      refresh();
    });
    razorpay.on(
      Razorpay.EVENT_PAYMENT_ERROR,
      (PaymentFailureResponse r) =>
          message(r.message ?? 'Payment was not completed.'),
    );
    refresh();
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    razorpay.clear();
    super.dispose();
  }

  void message(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> refresh() async {
    try {
      final config = await widget.api.call('config');
      final c = await widget.api.call('catalog');
      Map<String, dynamic>? d;
      try {
        d = Map<String, dynamic>.from(await widget.api.call('workspace'));
      } catch (e) {
        if (data != null) rethrow;
      }
      if (mounted) {
        setState(() {
          catalog = Map<String, dynamic>.from(c);
          data = d;
          demo = config['demo'] == true;
          error = null;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString().replaceFirst('Exception: ', '');
          loading = false;
        });
      }
    }
  }

  Future<void> perform(Future<void> Function() fn) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await fn();
      await refresh();
      if (detail != null) {
        final d = await widget.api.call(
          'enrolments/${detail!['enrolment']['id']}',
        );
        if (mounted) setState(() => detail = Map<String, dynamic>.from(d));
      }
    } catch (e) {
      message(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> pay(String type, String id) async {
    await perform(() async {
      final p = await widget.api.call(
        'payments',
        method: 'POST',
        body: {'referenceType': type, 'referenceId': id},
      );
      if (p['mode'] == 'demo') {
        await widget.api.call(
          'payments/demo',
          method: 'POST',
          body: {'paymentId': p['id']},
        );
        message('Simulated payment. No money collected.');
      } else {
        razorpay.open({
          'key': p['keyId'],
          'amount': p['amount_paise'],
          'currency': p['currency'],
          'order_id': p['provider_order_id'],
          'name': 'INCYS',
        });
      }
    });
  }

  Future<Map<String, String>?> input(String title, List<String> labels) async {
    final controllers = {
      for (final label in labels) label: TextEditingController(),
    };
    final form = GlobalKey<FormState>();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Form(
            key: form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: labels
                  .map(
                    (label) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: TextFormField(
                        controller: controllers[label],
                        decoration: InputDecoration(labelText: label),
                        maxLines:
                            label.contains('Message') ||
                                label.contains('Response')
                            ? 4
                            : 1,
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (form.currentState!.validate()) {
                Navigator.pop(ctx, {
                  for (final e in controllers.entries)
                    e.key: e.value.text.trim(),
                });
              }
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    Future<void>.delayed(const Duration(milliseconds: 400), () {
      for (final c in controllers.values) {
        c.dispose();
      }
    });
    return result;
  }

  Widget heading(String title, [String? sub]) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 22, 4, 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (sub != null)
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(sub)),
      ],
    ),
  );
  Widget card(
    String title,
    String subtitle, {
    List<Widget> actions = const [],
    IconData icon = Icons.spa_outlined,
  }) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: const Color(0xff205c46)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(subtitle),
          if (actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Wrap(spacing: 8, children: actions),
            ),
        ],
      ),
    ),
  );
  Widget action(String label, VoidCallback fn) =>
      TextButton(onPressed: busy ? null : fn, child: Text(label));
  Future<void> book() async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => BookingPage(catalog: catalog!)),
    );
    if (result != null) {
      await perform(() async {
        await widget.api.call('appointments', method: 'POST', body: result);
        message('Appointment confirmed.');
      });
    }
  }

  Future<void> checkout() async {
    final f = await input('Delivery details', [
      'Recipient name',
      'Phone',
      'Street address',
      'City',
      'PIN code',
    ]);
    if (f == null) return;
    await perform(() async {
      await widget.api.call(
        'orders',
        method: 'POST',
        body: {
          'items': cart.entries
              .map((e) => {'productId': e.key, 'quantity': e.value})
              .toList(),
          'address': {
            'name': f['Recipient name'],
            'phone': f['Phone'],
            'line': f['Street address'],
            'city': f['City'],
            'postcode': f['PIN code'],
          },
          'idempotencyKey':
              'mobile-${DateTime.now().microsecondsSinceEpoch}-${data!['user']['id']}',
        },
      );
      cart.clear();
      tab = 4;
      message('Order created. Complete payment in My orders.');
    });
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (data == null) return loginView();
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.spa_outlined),
            SizedBox(width: 10),
            Text('INCYS', style: TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
        actions: [
          IconButton(
            onPressed: refresh,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (demo)
              const MaterialBanner(
                content: Text(
                  'Development preview · Sample data and simulated payments',
                ),
                actions: [SizedBox.shrink()],
              ),
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: refresh,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 35),
                  children: content(),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() {
          tab = i;
          detail = null;
        }),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            label: 'Bookings',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            label: 'Learn',
          ),
          NavigationDestination(
            icon: Icon(Icons.shopping_bag_outlined),
            label: 'Store',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Account',
          ),
        ],
      ),
    );
  }

  Widget loginView() => Scaffold(
    appBar: AppBar(title: const Text('INCYS')),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  Icons.spa_outlined,
                  size: 58,
                  color: Color(0xff205c46),
                ),
                const SizedBox(height: 25),
                Text(
                  registering
                      ? 'Create your account'
                      : 'Welcome to your institute',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 10),
                const Text('Learning, care and community. All in one place.'),
                const SizedBox(height: 28),
                if (registering) ...[
                  TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Full name'),
                  ),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Email address'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: password,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Password'),
                ),
                if (registering)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 15),
                    child: Text(
                      'Creating an account allows institute bookings, learning and support. Use a password with at least 12 characters.',
                    ),
                  ),
                const SizedBox(height: 20),
                if (registering)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: accountConsent,
                    onChanged: (value) =>
                        setState(() => accountConsent = value ?? false),
                    title: const Text(
                      'I agree to create an institute account for booking, learning and support.',
                    ),
                  ),
                FilledButton(
                  onPressed: busy || (registering && !accountConsent)
                      ? null
                      : () => perform(() async {
                          if (registering) {
                            if (name.text.trim().length < 2 ||
                                password.text.length < 12) {
                              throw Exception(
                                'Enter your full name and a password of at least 12 characters.',
                              );
                            }
                            await widget.api.register(
                              name.text.trim(),
                              email.text.trim(),
                              password.text,
                            );
                          } else {
                            await widget.api.signIn(
                              email.text.trim(),
                              password.text,
                            );
                          }
                          password.clear();
                        }),
                  child: Text(
                    busy
                        ? 'Please wait…'
                        : registering
                        ? 'Create account'
                        : 'Sign in',
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() => registering = !registering),
                  child: Text(
                    registering
                        ? 'Already registered? Sign in'
                        : 'Create an account',
                  ),
                ),
                if (error != null) ...[
                  Text(error!, style: const TextStyle(color: Colors.red)),
                  TextButton(
                    onPressed: refresh,
                    child: const Text('Retry connection'),
                  ),
                ],
                if (demo && !kReleaseMode) ...[
                  const Divider(),
                  const Text('Sample accounts'),
                  Wrap(
                    spacing: 8,
                    children: ['patient', 'student']
                        .map(
                          (role) => ActionChip(
                            label: Text(role),
                            onPressed: () {
                              email.text = '$role@demo.incys.local';
                              password.text = 'local-demo-only-change-me';
                            },
                          ),
                        )
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
  List<Widget> content() {
    final d = data!, c = catalog!;
    if (tab == 0) {
      return [
        heading(
          'Welcome, ${d['user']['name'].toString().split(' ').first}.',
          'Make a little space for your wellbeing.',
        ),
        card(
          'Your next step starts here.',
          'Find a consultation, continue a lesson or prepare for your next class.',
          actions: [
            FilledButton(
              onPressed: book,
              child: const Text('Book an appointment'),
            ),
          ],
        ),
        heading('Institute updates'),
        ...(c['announcements'] as List).map(
          (a) => card(a['title'], a['body'], icon: Icons.notifications_none),
        ),
        heading('Your notifications'),
        ...(d['notifications'] as List)
            .take(5)
            .map(
              (n) => card(
                n['title'],
                n['body'],
                icon: Icons.notifications_outlined,
              ),
            ),
      ];
    }
    if (tab == 1) {
      return [
        heading('My appointments', 'Times use your device time zone.'),
        FilledButton.icon(
          onPressed: busy ? null : book,
          icon: const Icon(Icons.add),
          label: const Text('Book appointment'),
        ),
        const SizedBox(height: 20),
        ...(d['appointments'] as List).map(
          (a) => card(
            a['service_name'],
            '${a['practitioner_name']}\n${localDate(a['starts_at'])}\n${a['status']} · ${money(a['price_paise'])} · ${a['payment_status']}',
            actions: [
              if (a['status'] == 'confirmed' && a['payment_status'] == 'due')
                action(
                  demo ? 'Simulate payment' : 'Pay now',
                  () => pay('appointment', a['id']),
                ),
              if (a['status'] == 'confirmed')
                action(
                  'Cancel',
                  () => perform(() async {
                    await widget.api.call(
                      'appointments/${a['id']}',
                      method: 'PATCH',
                      body: {'status': 'cancelled'},
                    );
                  }),
                ),
              action(
                'View records',
                () => perform(() async {
                  final notes = await widget.api.call(
                    'appointments/${a['id']}/notes',
                  ) as List;
                  if (mounted) {
                    await showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Encounter records'),
                        content: SingleChildScrollView(
                          child: Text(
                            notes.isEmpty
                                ? 'No notes recorded.'
                                : notes
                                      .map(
                                        (n) =>
                                            '${n['body']}\n${n['author_name']} · ${localDate(n['created_at'])}',
                                      )
                                      .join('\n\n'),
                          ),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Close'),
                          ),
                        ],
                      ),
                    );
                  }
                }),
              ),
              if (a['mode'] == 'online' && a['status'] == 'confirmed')
                action(
                  'Join consultation',
                  () => perform(() async {
                    final meeting = await widget.api.call(
                      'appointments/${a['id']}/join',
                      method: 'POST',
                      body: {},
                    );
                    await launchUrl(
                      Uri.parse(meeting['url']),
                      mode: LaunchMode.externalApplication,
                    );
                  }),
                ),
            ],
          ),
        ),
        heading('Care plans'),
        ...(d['plans'] as List).map(
          (p) => card(
            p['title'],
            '${p['instructions']}\n${p['sessions_completed']} of ${p['sessions_total']} sessions',
          ),
        ),
      ];
    }
    if (tab == 2 && detail != null) return learning();
    if (tab == 2) {
      return [
        heading('My learning', 'Your courses, classes and progress.'),
        ...(d['enrolments'] as List).map(
          (e) => card(
            e['course_title'],
            '${e['cohort_name']} · ${e['status']}\n${e['completed_lessons']}/${e['total_lessons']} lessons · ${money(e['fee_paise'] - e['paid_paise'])} due',
            icon: Icons.menu_book_outlined,
            actions: [
              if (['active', 'completed'].contains(e['status']))
                action(
                  'Open course',
                  () => perform(() async {
                    final v = await widget.api.call('enrolments/${e['id']}');
                    if (mounted) {
                      setState(() => detail = Map<String, dynamic>.from(v));
                    }
                  }),
                ),
              if (e['paid_paise'] < e['fee_paise'])
                action('Pay fees', () => pay('enrolment', e['id'])),
            ],
          ),
        ),
        heading('Upcoming intakes'),
        ...(c['cohorts'] as List).map(
          (h) => card(
            h['name'],
            '${localDate(h['starts_at'])}\n${h['enrolled']}/${h['capacity']} places',
            icon: Icons.school_outlined,
            actions: [
              action(
                'Apply',
                () => perform(() async {
                  final accepted = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: Text('Apply to ${h['name']}?'),
                      content: const Text(
                        'I agree to submit this admission application for review by the institute. Fees and admission are managed in my learning account.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Agree and apply'),
                        ),
                      ],
                    ),
                  );
                  if (accepted != true) return;
                  await widget.api.call(
                    'enrolments',
                    method: 'POST',
                    body: {'cohortId': h['id'], 'consent': true},
                  );
                  message('Application received.');
                }),
              ),
            ],
          ),
        ),
      ];
    }
    if (tab == 3) {
      return [
        heading('Wellness essentials', 'Support your everyday practice.'),
        if (cart.isNotEmpty)
          FilledButton.icon(
            onPressed: checkout,
            icon: const Icon(Icons.shopping_cart_outlined),
            label: Text(
              'Checkout · ${cart.values.fold(0, (a, b) => a + b)} items',
            ),
          ),
        const SizedBox(height: 14),
        ...(c['products'] as List).map(
          (p) => card(
            p['name'],
            '${p['description']}\n${money(p['price_paise'])} · ${cart[p['id']] ?? 0} in basket',
            icon: Icons.shopping_bag_outlined,
            actions: [
              if ((cart[p['id']] ?? 0) > 0)
                action(
                  'Remove one',
                  () => setState(() {
                    final n = cart[p['id']]! - 1;
                    if (n == 0) {
                      cart.remove(p['id']);
                    } else {
                      cart[p['id']] = n;
                    }
                  }),
                ),
              if (p['stock'] > (cart[p['id']] ?? 0))
                action(
                  'Add to basket',
                  () =>
                      setState(() => cart[p['id']] = (cart[p['id']] ?? 0) + 1),
                ),
            ],
          ),
        ),
      ];
    }
    return [
      heading('My account', d['user']['email']),
      card(
        d['user']['name'],
        (d['user']['roles'] as List).join(', '),
        icon: Icons.person_outline,
      ),
      heading('My orders'),
      ...(d['orders'] as List).map(
        (o) => card(
          'Order ${o['id'].toString().substring(0, 8)}',
          '${money(o['total_paise'])} · ${o['status']}\n${(o['items'] as List? ?? []).map((i) => '${i['product_name']} × ${i['quantity']}').join('\n')}',
          icon: Icons.inventory_2_outlined,
          actions: [
            if (o['status'] == 'pending_payment')
              action('Pay', () => pay('order', o['id'])),
          ],
        ),
      ),
      heading('Payments'),
      ...(d['payments'] as List).map(
        (p) => card(
          '${p['reference_type']} payment',
          '${money(p['amount_paise'])} · ${p['status']}',
          icon: Icons.receipt_long_outlined,
          actions: [
            if (p['status'] == 'captured')
              action('Request refund', () async {
                final f = await input('Request refund', ['Reason']);
                if (f != null) {
                  await perform(() async {
                    await widget.api.call(
                      'refunds',
                      method: 'POST',
                      body: {'paymentId': p['id'], 'reason': f['Reason']},
                    );
                    message('Refund request submitted.');
                  });
                }
              }),
          ],
        ),
      ),
      heading('Support'),
      ...(d['tickets'] as List).map(
        (t) => card(
          t['subject'],
          '${t['status']}\n${t['response'] ?? t['message']}',
          icon: Icons.help_outline,
        ),
      ),
      OutlinedButton.icon(
        onPressed: () async {
          final f = await input('Contact support', ['Subject', 'Message']);
          if (f != null) {
            await perform(() async {
              await widget.api.call(
                'tickets',
                method: 'POST',
                body: {'subject': f['Subject'], 'message': f['Message']},
              );
              message('Support request sent.');
            });
          }
        },
        icon: const Icon(Icons.chat_bubble_outline),
        label: const Text('New support request'),
      ),
      const SizedBox(height: 15),
      TextButton(
        onPressed: () async {
          await widget.api.signOut();
          cart.clear();
          if (mounted) setState(() => data = null);
        },
        child: const Text('Sign out'),
      ),
    ];
  }

  List<Widget> learning() {
    final d = detail!;
    return [
      action('Back to my courses', () => setState(() => detail = null)),
      heading(d['enrolment']['cohort_name']),
      ...(d['lessons'] as List).map(
        (l) => Card(
          child: ExpansionTile(
            title: Text(l['title']),
            leading: Icon(
              l['completed_at'] == null
                  ? Icons.menu_book_outlined
                  : Icons.check_circle_outline,
            ),
            children: [
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l['content']),
                    if (l['resource_url'] != null)
                      action(
                        'Open resource',
                        () => launchUrl(
                          Uri.parse(l['resource_url']),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                    if (l['completed_at'] == null)
                      action(
                        'Mark complete',
                        () => perform(() async {
                          await widget.api.call(
                            'enrolments/${d['enrolment']['id']}/lessons',
                            method: 'POST',
                            body: {'lessonId': l['id']},
                          );
                        }),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      heading('Live classes'),
      ...(d['classes'] as List).map(
        (cl) => card(
          cl['title'],
          '${localDate(cl['starts_at'])}\nAttendance: ${cl['present'] == null
              ? 'Not recorded'
              : cl['present']
              ? 'Present'
              : 'Absent'}',
          actions: [
            action(
              'Join',
              () => perform(() async {
                final link = await widget.api.call(
                  'classes/${cl['id']}/join',
                  method: 'POST',
                  body: {},
                );
                await launchUrl(
                  Uri.parse(link['url']),
                  mode: LaunchMode.externalApplication,
                );
              }),
            ),
          ],
        ),
      ),
      heading('Assignments'),
      ...(d['assignments'] as List).map(
        (a) => card(
          a['title'],
          '${a['instructions']}\n${a['score'] == null ? 'Due ${localDate(a['due_at'])}' : '${a['score']}/${a['max_score']} · ${a['feedback']}'}',
          actions: [
            if (a['score'] == null)
              action('Submit response', () async {
                final f = await input(a['title'], ['Response']);
                if (f != null) {
                  await perform(() async {
                    await widget.api.call(
                      'assignments/${a['id']}/submit',
                      method: 'POST',
                      body: {'body': f['Response']},
                    );
                  });
                }
              }),
          ],
        ),
      ),
      heading('Assessments'),
      ...(d['quizzes'] as List).map(
        (q) => card(
          q['title'],
          '${q['duration_minutes']} minutes · Best score: ${q['best_score'] ?? '—'}',
          actions: [
            action(
              'Start',
              () => perform(() async {
                final a = await widget.api.call(
                  'quizzes/${q['id']}/start',
                  method: 'POST',
                  body: {},
                );
                if (!mounted) return;
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => QuizPage(
                      api: widget.api,
                      attempt: Map<String, dynamic>.from(a),
                    ),
                  ),
                );
              }),
            ),
          ],
        ),
      ),
      if (d['certificate'] != null)
        FilledButton(
          onPressed: () => launchUrl(
            Uri.parse(
              '${InstituteApi.baseUrl}/verify/${d['certificate']['serial']}',
            ),
            mode: LaunchMode.externalApplication,
          ),
          child: const Text('View certificate'),
        ),
    ];
  }
}

class BookingPage extends StatefulWidget {
  const BookingPage({super.key, required this.catalog});
  final Map<String, dynamic> catalog;
  @override
  State<BookingPage> createState() => _BookingPageState();
}

class _BookingPageState extends State<BookingPage> {
  String? service, provider, time;
  String mode = 'in_person';
  bool consent = false;
  @override
  Widget build(BuildContext context) {
    final services = widget.catalog['services'] as List,
        providers = (widget.catalog['practitioners'] as List)
            .where(
              (p) =>
                  service == null ||
                  (p['service_ids'] as List).contains(service),
            )
            .toList();
    final s = services.where((x) => x['id'] == service).firstOrNull;
    final slots = <String>[];
    if (s != null && provider != null) {
      for (final w in widget.catalog['availability'] as List) {
        if (w['practitioner_id'] != provider) continue;
        final end = DateTime.parse(w['ends_at']);
        for (
          var t = DateTime.parse(w['starts_at']);
          !t.add(Duration(minutes: s['duration_minutes'])).isAfter(end);
          t = t.add(const Duration(minutes: 15))
        ) {
          if (t.isAfter(DateTime.now())) slots.add(t.toUtc().toIso8601String());
        }
      }
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Book an appointment')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          DropdownButtonFormField<String>(
            initialValue: service,
            decoration: const InputDecoration(labelText: 'Service'),
            items: services
                .map(
                  (x) => DropdownMenuItem(
                    value: x['id'] as String,
                    child: Text(x['name']),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() {
              service = v;
              provider = null;
              time = null;
            }),
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            key: ValueKey(service),
            initialValue: provider,
            decoration: const InputDecoration(labelText: 'Practitioner'),
            items: providers
                .map(
                  (x) => DropdownMenuItem(
                    value: x['id'] as String,
                    child: Text(x['name']),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() {
              provider = v;
              time = null;
            }),
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            key: ValueKey('$provider:$service'),
            isExpanded: true,
            initialValue: time,
            decoration: const InputDecoration(labelText: 'Preferred time'),
            items: slots
                .toSet()
                .map(
                  (x) => DropdownMenuItem(value: x, child: Text(localDate(x))),
                )
                .toList(),
            onChanged: (v) => setState(() => time = v),
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: mode,
            decoration: const InputDecoration(labelText: 'Appointment type'),
            items: const [
              DropdownMenuItem(
                value: 'in_person',
                child: Text('At the institute'),
              ),
              DropdownMenuItem(
                value: 'online',
                child: Text('Online consultation'),
              ),
            ],
            onChanged: (v) => setState(() => mode = v!),
          ),
          if (s != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Text(
                '${s['duration_minutes']} minutes · ${money(s['price_paise'])}',
              ),
            ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: consent,
            onChanged: (v) => setState(() => consent = v!),
            title: const Text(
              'I agree to this booking and, if online, a remote consultation with the assigned practitioner.',
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed:
                service != null && provider != null && time != null && consent
                ? () => Navigator.pop(context, {
                    'serviceId': service,
                    'practitionerId': provider,
                    'startsAt': time,
                    'mode': mode,
                    'consent': true,
                  })
                : null,
            child: const Text('Confirm booking'),
          ),
          const SizedBox(height: 15),
          const Text(
            'Availability is checked when you confirm. Times use your device time zone.',
          ),
        ],
      ),
    );
  }
}

class QuizPage extends StatefulWidget {
  const QuizPage({super.key, required this.api, required this.attempt});
  final InstituteApi api;
  final Map<String, dynamic> attempt;
  @override
  State<QuizPage> createState() => _QuizPageState();
}

class _QuizPageState extends State<QuizPage> {
  late List<int> answers;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    answers = List.filled((widget.attempt['questions'] as List).length, -1);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.attempt['title'])),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Submit before ${localDate(widget.attempt['expiresAt'])}. The server enforces this deadline.',
        ),
        const SizedBox(height: 20),
        ...(widget.attempt['questions'] as List).asMap().entries.map(
          (e) => Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.value['prompt'],
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<int>(
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Choose your answer',
                    ),
                    items: (e.value['options'] as List)
                        .asMap()
                        .entries
                        .map(
                          (o) => DropdownMenuItem(
                            value: o.key,
                            child: Text(o.value),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => answers[e.key] = v!,
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy
              ? null
              : () async {
                  setState(() => busy = true);
                  try {
                    final r = await widget.api.call(
                      'quiz-attempts/${widget.attempt['id']}',
                      method: 'POST',
                      body: {'answers': answers},
                    );
                    if (!context.mounted) return;
                    await showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: Text(
                          r['passed']
                              ? 'Assessment passed'
                              : 'Assessment complete',
                        ),
                        content: Text('Your score: ${r['score']}%'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Done'),
                          ),
                        ],
                      ),
                    );
                    if (context.mounted) Navigator.pop(context);
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  } finally {
                    if (mounted) setState(() => busy = false);
                  }
                },
          child: Text(busy ? 'Submitting…' : 'Submit assessment'),
        ),
      ],
    ),
  );
}
