# Shared API guide

Base path: `/api/v1`. JSON request/response bodies use camelCase input and persisted snake_case output. Timestamps are ISO 8601 with offsets; amounts are integer paise in INR. API errors return `{ "error": "message" }`, optionally with field-validation details. No success response should be inferred from a provider checkout callback.

Production clients send `Authorization: Bearer FIREBASE_ID_TOKEN`. Local development also supports an opaque bearer token or HttpOnly cookie issued by `POST /auth/login`. Cookie mutations require the exact configured Origin; native clients use bearer authentication. No cross-origin browser CORS policy is enabled. Standard JSON bodies are limited to 64 KiB; document bodies to 11 MiB including multipart overhead, with a 10 MiB file limit.

## Public and identity

| Method / path                                        | Purpose                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /health`                                        | Database readiness                                                                                   |
| `GET /config`                                        | Development/auth/payment capability flags                                                            |
| `GET /catalog`                                       | Published services, practitioners, availability, courses, cohorts, products and public announcements |
| `POST /enquiries`                                    | Consented operational enquiry                                                                        |
| `GET /verify/:serial`                                | Minimal certificate verification and revocation state                                                |
| `POST /auth/register`, `/auth/login`, `/auth/logout` | Development identity/session endpoints; local registration/login disabled in production              |
| `GET /me`, `/workspace`                              | Current user and permission-scoped workspace                                                         |

## Clinic and learning

| Method / path                                                 | Purpose                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /appointments`                                          | Book service/practitioner/start/mode with explicit consent       |
| `PATCH /appointments/:id`                                     | Cancel or record completed/no-show, subject to role and state    |
| `GET`, `POST /appointments/:id/notes`                         | Assigned practitioner/patient clinical records; clinician writes |
| `POST /appointments/:id/meeting`, `/appointments/:id/join`    | Configure HTTPS meeting / return a gated join URL                |
| `POST /plans`, `/plans/:id/sessions`                          | Create/record clinician treatment plans                          |
| `POST /enrolments`                                            | Apply for a published cohort with consent                        |
| `GET`, `PATCH /enrolments/:id`                                | Learning details / admin admission decision                      |
| `POST /enrolments/:id/lessons`, `/enrolments/:id/certificate` | Student progress / admin certificate issuance                    |
| `POST /assignments/:id/submit`                                | Active learner's response and optional private attachment                                 |
| `PATCH /submissions/:id`                                      | Assigned trainer/admin grade and feedback                        |
| `POST /classes/:id/attendance`, `/classes/:id/join`           | Record attendance / gated meeting URL                            |
| `POST /quizzes`, `/quizzes/:id/start`, `/quiz-attempts/:id`   | Author assessment, start/resume own attempt, submit answers      |

## Commerce and operations

| Method / path                                                                                                                                                                          | Purpose                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `POST /orders`                                                                                                                                                                         | Reserve cart stock with a customer-scoped idempotency key             |
| `POST /orders/:id/cancel`                                                                                                                                                              | Cancel an unpaid order and restore its reservation once               |
| `PATCH /order-items/:id`                                                                                                                                                               | Assigned vendor/admin fulfilment transition and tracking              |
| `POST /payments`                                                                                                                                                                       | Create/reuse checkout for an owned order, appointment or enrolment    |
| `POST /payments/demo`                                                                                                                                                                  | Synthetic capture only in non-production demo mode                    |
| `POST /payments/webhook`                                                                                                                                                               | Raw-body provider HMAC validation and idempotent processing           |
| `POST /refunds`, `/refunds/:id/approve`                                                                                                                                                | Full refund request / different staff approver                        |
| `POST /documents`, `GET /documents/:id`                                                                                                                                                | Multipart upload / authorized audited download                        |
| `POST /devices`, `/devices/unregister`                                                                                                                                                 | Register/remove the current user's push token                         |
| `POST /privacy-requests`, `PATCH /privacy-requests/:id`                                                                                                                                | Request review / admin response and status                            |
| `POST /services`, `/availability`, `/courses`, `/course-versions`, `/cohorts`, `/lessons`, `/classes`, `/assignments`                                                                  | Role-scoped catalogue and academic creation                           |
| `POST /vendors`, `/products`, `/tickets`, `/announcements`                                                                                                                             | Partnership application, product submission, support, publication     |
| `PATCH /vendors/:id`, `/products/:id`, `/enquiries/:id`, `/tickets/:id`, `/classes/:id`, `/users/:id`, `/notifications/:id`, `/certificates/:id`, `/courses/:id`, `/announcements/:id` | Scoped operational changes; see server validation for accepted fields |

The route source and Zod schemas are authoritative; a generated OpenAPI contract and version compatibility policy remain to be added before external integrations. Collection data currently comes from `/workspace` with bounded recent-record limits; cursor pagination and bulk exports remain open scope.

Example appointment body:

```json
{
  "serviceId": "SERVICE_UUID",
  "practitionerId": "PRACTITIONER_UUID",
  "startsAt": "2026-12-01T09:00:00+05:30",
  "mode": "in_person",
  "consent": true
}
```

Example checkout body:

```json
{
  "referenceType": "order",
  "referenceId": "ORDER_UUID"
}
```

Use a new idempotency key for a new purchase, and reuse it when retrying the same checkout request. Do not reuse a key for a changed cart. To use live integrations, complete the deployment runbook and provider test-mode acceptance first.

Assignment submissions accept `{ "body": "...", "documentId": "UUID or null" }`. The document must belong to the learner, be clean and have purpose `assignment_attachment`. Omitting `documentId` preserves an existing attachment; `null` removes it. Only the owner, the assigned cohort trainer or an academic administrator can download a linked assignment attachment. Unlinked academic uploads remain owner-only. Graded submissions cannot be replaced.
