# Distributor listing imports

A distributor owner or staff member can upload a CSV or XLSX file, review the parsed rows, and explicitly commit the valid rows. Uploading a file does not create or update listings. The importer does not create or edit medicines, ingredients, manufacturers, compositions, or packs.

API, SFTP, ERP, and POS integrations, scheduled imports, and orders are not part of this workflow. The preview runs in the API request. Redis and BullMQ stay reserved for a later unattended import worker. Uploaded bytes are not stored in S3 or on disk. MedStock keeps the checksum, file name, byte size, and staged rows.

The distributor workspace uploads through the web server at `POST /api/distributor/imports`. That route reads the HttpOnly session, forwards the file to the API, and returns only the import id. The browser never receives the access token, checksum, or staged raw cells.

## Template

The first row is a header. Column names are matched after trimming and lowercasing. Unknown columns reject the file.

| Column | Required | Meaning |
| --- | --- | --- |
| `medicine_name` | No, when `pack_id` is present | Matching aid. It is not stored on the listing. |
| `pack_id` | Preferred | Canonical `MedicinePack` id. |
| `pack_description` | No | Matching aid. It is not a source of truth. |
| `indicative_unit_price` | Yes | Nonnegative decimal with at most two decimal places. `0` is allowed. |
| `currency` | Yes | `INR` only. |
| `minimum_order_quantity` | Yes | Positive whole number. |
| `stock_status` | Yes | `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, or `UNKNOWN`. |
| `available_quantity` | No | Nonnegative whole number of packs when the distributor supplies it. A blank cell does not change an existing quantity. |
| `source_note` | No | At most 200 characters. A blank cell does not change an existing note. |

A row needs `pack_id`, or enough of a name and description to match exactly one existing pack. The file cannot set timestamps, freshness, listing status, or source.

## Limits and file checks

- Maximum file size: 1 MB. The upload route rejects a larger multipart file with HTTP 413 before a preview is stored. A buffer that reaches the importer another way is rejected with `import_file_rejected`.
- Maximum data rows: 500, not counting the header.
- Extensions: `.csv` and `.xlsx`. The bytes must match the extension. A ZIP workbook uploaded as CSV is rejected, and a CSV uploaded as XLSX is rejected.
- MIME type is not trusted.
- A malformed, empty, or encrypted workbook is rejected with `import_file_rejected`.
- A file-level problem does not create an import record.
- Row-level problems create a preview. Invalid rows stay in the report.

Text echoed in the preview is prefixed with `'` when it starts with `=`, `+`, `-`, `@`, tab, or carriage return, so a later spreadsheet export does not treat it as a formula. The stored staged value is unchanged, and commit does not write the quote into a listing.

## Matching

1. If `pack_id` is present, it must equal one canonical pack id. Zero matches is a row error. The importer does not fuzzy-match.
2. A pack is eligible only when its medicine is published and search-visible. Draft, archived, and hidden medicines are rejected. This is stricter than manual listing creation, which can still reference a draft pack.
3. If `pack_id` is absent, the row matches only when the supplied medicine name and pack description select exactly one existing pack. A medicine name alone matches only when that medicine has exactly one pack. A description alone matches only when exactly one pack uses it. Zero or multiple matches is a row error.
4. A description or medicine name that disagrees with a valid `pack_id` is a warning. The pack id wins.
5. A distributor has one listing per pack, including paused, archived, and suspended rows. Two rows in one file that match the same pack are both invalid.
6. An active listing is an update. A paused, archived, or suspended listing is a row error. Import does not reactivate it.

## Workflow

1. `POST /distributor/imports?organizationId=` with multipart field `file` parses the file and stores a `PREVIEW_READY` import.
2. `GET /distributor/imports?organizationId=&page=&pageSize=` lists summaries for that organization. A summary includes the file name, status, row counts, upload time, and completion time. It omits the checksum, byte size, and staged rows.
3. `GET /distributor/imports/:importId` returns the staged rows, matched pack, proposed price, MOQ, stock, available quantity, create-or-update action, errors, and warnings.
4. `POST /distributor/imports/:importId/commit` applies the staged valid rows.
5. `POST /distributor/imports/:importId/cancel` cancels a preview that has not been committed.

`/app/imports` is the history and upload screen. `/app/imports/:importId` shows the persisted preview. Commit and cancel are separate controls, and both are hidden once the import is no longer `PREVIEW_READY`. A repeated commit of an already committed import shows the stored completion counts. The screen does not show checksums, raw cells, audit records, or server diagnostics.

Allowed transitions:

- `PREVIEW_READY` to `COMMITTED`
- `PREVIEW_READY` to `CANCELLED`

`COMMITTED` and `CANCELLED` are terminal. `FAILED` is reserved and is not written by this workflow. A second commit of a committed import returns the stored result and does not write listings or audits again.

Uploading the same bytes again while a preview for that organization and checksum is still `PREVIEW_READY` returns that preview. A committed import does not block a new preview of the same file.

## Commit

Only an active distributor owner or staff member of the organization that owns the import can commit it. Another organization's import id returns `import_not_found`. The actor comes from the access token. The file cannot name the actor or the organization.

Commit rechecks pack eligibility and listing status inside one database transaction. The import row is claimed with a conditional update from `PREVIEW_READY` to `COMMITTED` before rows are applied. A concurrent commit sees the committed import and stops.

Valid rows are applied. Invalid rows are skipped and remain visible. A row is not partially applied: the listing write and its `listing.import_create` or `listing.import_update` audit share the transaction. If creating the listing hits the unique organization-and-pack constraint, that row is marked failed and the other rows continue.

An update writes only supplied values that differ. A price change refreshes `priceUpdatedAt` only. A stock-status or available-quantity change refreshes `stockUpdatedAt` only. An MOQ or source-note change refreshes neither. The server sets both timestamps when it creates a listing. Source becomes `CSV_IMPORT` only when a listing row is written. A row whose values already match the listing is skipped and does not add a listing audit.

Every commit writes one `import.commit` audit, including a commit whose rows are all invalid. Cancel writes one `import.cancel` audit. Preview does not write an audit, because it does not change listings. Listing audits store the import id.

## Authorization

Distributor owners and staff upload, read, commit, and cancel imports for their own organization. Retailers have no import access. A platform admin can read `GET /admin/imports/:importId`. That read is logged. Admins cannot commit or cancel an import.

A suspended distributor organization cannot use the import routes.

## Deferred

Scheduled imports, BullMQ workers, durable file storage, API, SFTP, ERP, and POS feeds, catalog editing through a spreadsheet, and enquiry imports are not implemented.
