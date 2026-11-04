
# MedStock — Cursor Project Instructions

## Product
MedStock is a B2B pharmacy procurement directory for medical retailers in India.

Retailers can:
- Search medicines by brand, generic name, salt/active ingredient, strength, dosage form, pack size, manufacturer, or SKU.
- Compare verified suppliers, indicative prices, minimum order quantities, stock status, and inventory freshness.
- Submit procurement enquiries and track supplier responses.

Distributors can:
- Register their organization and branches.
- Submit information for verification.
- Manage medicine listings and stock manually.
- Import inventory using CSV/XLSX.
- Respond to procurement enquiries.

Platform admins can:
- Verify organizations.
- Manage the canonical medicine catalog.
- Review import errors and audit activity.

## Technology
- Frontend: Next.js App Router, TypeScript
- UI: Tailwind CSS and shadcn/ui
- Backend: NestJS REST API
- Database: PostgreSQL
- ORM: Prisma
- Queue: Redis + BullMQ
- Testing: Jest, Supertest, Playwright
- Local development: Docker Compose
- Deployment target: AWS ECS/Fargate, RDS, S3, Secrets Manager, CloudWatch

## Architecture
- Use a modular monolith for the MVP.
- Keep frontend and backend in separate applications.
- Keep database schema and shared types in packages.
- Organize backend by domain modules.
- Prefer simple, maintainable solutions over premature abstractions.
- Do not introduce microservices unless explicitly requested.

## Engineering rules
- TypeScript strict mode.
- Avoid `any`; use explicit types and DTOs.
- Validate all incoming API data.
- Use Prisma migrations for schema changes.
- Never edit generated Prisma files manually.
- Never hardcode secrets.
- Use environment variables and provide `.env.example`.
- Add tests for important business logic and permissions.
- Do not silently change unrelated files.
- Do not remove existing functionality without explaining why.
- Before adding a dependency, explain why it is needed.
- Use accessible, responsive UI components.
- Handle loading, empty, error, and success states in every data-driven screen.
- Include useful logging without exposing passwords, tokens, or sensitive data.

## Security
- Enforce organization-level tenant isolation.
- Use organization memberships and role-based access control.
- Verify authorization on the server, not only in the UI.
- Treat supplier inventory as supplier-owned data.
- Do not claim stock is guaranteed unless confirmed by the supplier.
- Keep audit trails for important catalog, inventory, verification, and procurement changes.
- MedStock must not collect patient clinical data.

## Cursor task workflow
For every task:
1. Inspect the existing code before editing.
2. Summarize the implementation plan briefly.
3. Implement only the requested task.
4. Run relevant lint, typecheck, tests, and build commands.
5. Fix errors caused by the changes.
6. Summarize files changed, commands run, results, and any remaining issues.
7. Do not claim a test passed unless you actually ran it.
