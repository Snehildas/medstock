# @medstock/web

Next.js App Router shell for MedStock.

Sign-in uses the Cognito hosted UI. The session cookie is HttpOnly and is read on the server. See `docs/authentication.md` for the app client, redirect URLs, and the variables that belong in `apps/web/.env.local`.

Without those variables, `/sign-in` explains what is missing. `pnpm --filter @medstock/web test` covers the session, organization selection, distributor workspace rules, and API client without a user pool.

Distributor tools use the selected organization and the existing API:

| Route | Purpose |
| --- | --- |
| `/app/listings` | Search and filter the distributor's listings. Prices are indicative. |
| `/app/listings/new` | Create a listing for a published catalog pack. |
| `/app/listings/:listingId` | Edit commercial fields, or pause, resume, and archive when the lifecycle allows it. |
| `/app/imports` | Upload a CSV or XLSX file for preview and review history. |
| `/app/imports/:importId` | Read the saved preview, then commit or cancel it. |

`API_ORIGIN` must point at the API that serves listings, catalog reads, imports, and enquiries. The browser upload route is `POST /api/distributor/imports`; it does not commit the file. Changing organization returns to `/app` and drops the previous page data.

Retailer tools use the same selected organization:

| Route | Purpose |
| --- | --- |
| `/app/discover` | Search published medicines. Results are catalog records, not advice. |
| `/app/discover/medicines/:medicineId` | Read composition and canonical packs. |
| `/app/discover/listings` | Compare indicative distributor listings. |
| `/app/discover/listings/:listingId` | Read a listing and send an enquiry for a number of catalog packs. |
| `/app/enquiries` | Retailer enquiry history, or the distributor's incoming enquiries. |
| `/app/enquiries/:enquiryId` | Read the request and response. Retailers can close an open or responded enquiry. Distributors can respond once while it is open. |

An enquiry is not an order, a quote, or a stock reservation. The API remains the authority for who can read, respond, or close.
