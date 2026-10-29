# Shared packages

Shared code belongs here only when it has a stable interface and at least two real consumers. Avoid duplicated implementations and packages created only to inflate the file count.

- `api-contracts/`: request/response schemas and error/pagination conventions.
- `shared/`: cross-domain constants and platform-neutral helpers.
- `validation/`: reusable input validation and unit tests.

These packages are not currently published or independently built.