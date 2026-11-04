# Procurement enquiries

An enquiry asks a distributor about one active listing. It is not an order, a quote, a reservation, or a payment. Creating or answering an enquiry does not change the listing price, stock status, available quantity, or freshness timestamps, and it does not reserve stock.

Requested quantity is a positive whole number of **catalog packs**. It is not a count of tablets or other units inside the pack. The pack description still comes from the canonical catalog through the listing.

## Lifecycle

`OPEN` is the initial status. An authorized distributor owner or staff member can respond once, which sets `RESPONDED`, the response message, the responding user, and the server response time. The retailer who owns the enquiry can close an `OPEN` or `RESPONDED` enquiry. `CLOSED` stays closed. There is no reopen path.

The role matrix lets distributors read and respond. It does not let them close an enquiry, so there is no distributor close route. Platform admins can read enquiries for audit and cannot change them.

## Authorization

The actor is the verified user. `organizationId` in the query selects the organization and is checked against an active membership. The body cannot set the retailer, the distributor, the status, the actor, or any timestamp.

The distributor organization is copied from the listing. The listing must be `ACTIVE`, the distributor organization must be `ACTIVE`, and the medicine must be published and search-visible. A retailer organization cannot enquire against a listing it owns.

Retailer members see enquiries for their organization. Distributor members see enquiries addressed to their organization. Another organization's members cannot read or respond. `GET /admin/enquiries` is the platform-admin read. Each enquiry on that page gets an `enquiry.admin_read` audit row. Ordinary responses do not include audit rows.

## API

- `POST /retailer/enquiries?organizationId=`
- `GET /retailer/enquiries?organizationId=`
- `GET /retailer/enquiries/:enquiryId`
- `POST /retailer/enquiries/:enquiryId/close`
- `GET /distributor/enquiries?organizationId=`
- `GET /distributor/enquiries/:enquiryId`
- `POST /distributor/enquiries/:enquiryId/respond`
- `GET /admin/enquiries`

Lists are ordered by creation time descending, then id. Create, respond, and close each write the enquiry change and the audit event in one transaction. A response or close updates the row only while it is still in an allowed status, so a second concurrent change does not overwrite the first.

The response says the record is an enquiry only. It includes the medicine name, pack description, listing id, requested pack quantity, messages, both organization ids, and the other party's organization name. It does not include the responding user's name. `respondedAt` is the server time of the response.

The web app uses these routes when the selected organization matches the enquiry:

| Route | Who | Purpose |
| --- | --- | --- |
| `/app/discover` | Retailer | Catalog search. Composition and packs come from each medicine's detail read. |
| `/app/discover/medicines/:medicineId` | Retailer | Read-only medicine detail. |
| `/app/discover/listings` | Retailer | Active listing comparison. |
| `/app/discover/listings/:listingId` | Retailer | Listing detail and enquiry form. |
| `/app/enquiries` | Retailer or distributor | That organization's enquiry history. |
| `/app/enquiries/:enquiryId` | Retailer or distributor | Detail. Retailers may close an open or responded enquiry. Distributors may respond once while it is open. |

An enquiry is not a quote or an order. The requested quantity is a number of catalog packs.

## Deferred

Orders, checkout, payments, invoices, shipment, notifications, chat, attachments, and public supplier discovery are not part of this flow. Listing imports are a separate distributor workflow in `docs/imports.md`.
