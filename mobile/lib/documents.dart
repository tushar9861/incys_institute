import 'package:file_picker/file_picker.dart';
import 'package:material_ui/material_ui.dart';

import 'api.dart';

Future<void> saveDocument(InstituteApi api, String id, String filename) async {
  final bytes = await api.downloadDocument(id);
  await FilePicker.saveFile(fileName: filename, bytes: bytes);
}

class DocumentsPanel extends StatefulWidget {
  const DocumentsPanel({
    super.key,
    required this.api,
    required this.documents,
    required this.onChanged,
  });
  final InstituteApi api;
  final List documents;
  final Future<void> Function() onChanged;
  @override
  State<DocumentsPanel> createState() => _DocumentsPanelState();
}

class _DocumentsPanelState extends State<DocumentsPanel> {
  String purpose = 'patient_report';
  String? error;
  bool busy = false;
  Future<void> run(Future<void> Function() task) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await task();
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> upload() async {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg'],
    );
    if (file == null) return;
    final size = await file.length();
    if (size == null || size <= 0 || size > 10 * 1024 * 1024) {
      throw Exception('Choose a PDF, PNG or JPEG file under 10 MB.');
    }
    final mime = switch (file.extension?.toLowerCase()) {
      'pdf' => 'application/pdf',
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      _ => throw Exception('This file format is not supported.'),
    };
    await widget.api.uploadDocument(
      filename: file.name,
      bytes: await file.readAsBytes(),
      mime: mime,
      purpose: purpose,
    );
    await widget.onChanged();
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('My documents', style: Theme.of(context).textTheme.titleLarge),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Upload PDF, PNG or JPEG files up to 10 MB. Files are checked before they become available.',
            ),
          ),
          DropdownButtonFormField<String>(
            initialValue: purpose,
            decoration: const InputDecoration(labelText: 'Document purpose'),
            items: const [
              DropdownMenuItem(
                value: 'patient_report',
                child: Text('Patient report'),
              ),
              DropdownMenuItem(
                value: 'admission_document',
                child: Text('Admission document'),
              ),
              DropdownMenuItem(
                value: 'assignment_attachment',
                child: Text('Assignment attachment'),
              ),
            ],
            onChanged: busy ? null : (v) => setState(() => purpose = v!),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: busy ? null : () => run(upload),
            icon: const Icon(Icons.upload_file),
            label: Text(busy ? 'Please wait…' : 'Choose and upload'),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ...widget.documents.map(
            (d) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(d['filename']),
              subtitle: Text(
                '${d['purpose'].replaceAll('_', ' ')} · ${(d['size_bytes'] / 1024).ceil()} KB${d['state'] == 'clean'
                    ? ''
                    : d['state'] == 'quarantined'
                    ? '\nAwaiting safety check'
                    : '\nRejected by safety check'}',
              ),
              trailing: IconButton(
                tooltip: 'Save ${d['filename']}',
                onPressed: busy || d['state'] != 'clean'
                    ? null
                    : () => run(
                        () => saveDocument(widget.api, d['id'], d['filename']),
                      ),
                icon: const Icon(Icons.download),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class AssignmentDialog extends StatefulWidget {
  const AssignmentDialog({
    super.key,
    required this.api,
    required this.assignment,
    required this.documents,
  });
  final InstituteApi api;
  final Map assignment;
  final List documents;
  @override
  State<AssignmentDialog> createState() => _AssignmentDialogState();
}

class _AssignmentDialogState extends State<AssignmentDialog> {
  late final response = TextEditingController(
    text: widget.assignment['submission_body'] ?? '',
  );
  late String attachment = widget.assignment['document_id'] ?? 'none';
  bool busy = false;
  String? error;
  @override
  void dispose() {
    response.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.assignment['title']),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: response,
            minLines: 4,
            maxLines: 8,
            maxLength: 30000,
            decoration: const InputDecoration(labelText: 'Your response'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: attachment,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Attachment'),
            items: [
              const DropdownMenuItem(
                value: 'none',
                child: Text('No attachment'),
              ),
              if (widget.assignment['document_id'] != null &&
                  !widget.documents.any(
                    (d) => d['id'] == widget.assignment['document_id'],
                  ))
                DropdownMenuItem<String>(
                  value: widget.assignment['document_id'],
                  child: Text(
                    widget.assignment['document_filename'] ??
                        'Current attachment',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ...widget.documents.map(
                (d) => DropdownMenuItem<String>(
                  value: d['id'],
                  child: Text(d['filename'], overflow: TextOverflow.ellipsis),
                ),
              ),
            ],
            onChanged: busy ? null : (v) => setState(() => attachment = v!),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'Upload an assignment attachment in Support → My documents first.',
            ),
          ),
          if (error != null)
            Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: busy ? null : () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: busy
            ? null
            : () async {
                if (response.text.trim().length < 5) {
                  setState(
                    () => error = 'Enter a response of at least 5 characters.',
                  );
                  return;
                }
                setState(() {
                  busy = true;
                  error = null;
                });
                try {
                  await widget.api.call(
                    'assignments/${widget.assignment['id']}/submit',
                    method: 'POST',
                    body: {
                      'body': response.text.trim(),
                      'documentId': attachment == 'none' ? null : attachment,
                    },
                  );
                  if (context.mounted) Navigator.pop(context, true);
                } catch (e) {
                  if (mounted) {
                    setState(() {
                      busy = false;
                      error = e.toString().replaceFirst('Exception: ', '');
                    });
                  }
                }
              },
        child: Text(busy ? 'Submitting…' : 'Submit'),
      ),
    ],
  );
}
