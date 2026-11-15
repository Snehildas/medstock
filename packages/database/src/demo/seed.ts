import { demoPersonas } from "@medstock/shared-types";
import { normalizeCatalogName } from "../catalog-name.js";
import {
  CatalogStatus,
  EnquiryStatus,
  IdentityProvider,
  IngredientKind,
  ListingCurrency,
  ListingSource,
  ListingStatus,
  MedicineCompanyRole,
  MedicineSubmissionStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  PrismaClient,
  StockStatus,
  StrengthUnit,
  UserStatus,
} from "../generated/prisma/client.js";

const illustrative = "Illustrative sample. Not a live commercial offer.";

function demoUuid(suffix: number): string {
  return `10000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing demo seed value: ${label}`);
  }
  return value;
}

const platformOrgId = demoUuid(1);
const retailerOrgId = demoUuid(2);
const secondRetailerOrgId = demoUuid(3);
const distributorOrgIds = [4, 5, 6, 7, 8].map(demoUuid) as [
  string,
  string,
  string,
  string,
  string,
];
const retailerUserId = demoUuid(101);
const distributorUserId = demoUuid(102);
const adminUserId = demoUuid(103);
const secondRetailerUserId = demoUuid(109);
const otherDistributorUserIds = [104, 105, 106, 107].map(demoUuid) as [string, string, string, string];
const manufacturerId = demoUuid(200);

const distributors = [
  { id: distributorOrgIds[0], slug: "demo-sable-depot", name: "Sable Depot", proprietor: "Nila Sample", phone: "9100000001", userId: distributorUserId, subject: demoPersonas.distributor.subject, email: demoPersonas.distributor.email, userName: demoPersonas.distributor.name },
  { id: distributorOrgIds[1], slug: "demo-kite-ridge", name: "Kite Ridge Wholesale", proprietor: "Dev Example", phone: "9100000002", userId: otherDistributorUserIds[0], subject: "medstock-demo-owner-kite", email: "owner.kite.demo@example.test", userName: "Dev Example" },
  { id: distributorOrgIds[2], slug: "demo-paperboat", name: "Paperboat Medical Supply", proprietor: "Rhea Fictional", phone: "9100000003", userId: otherDistributorUserIds[1], subject: "medstock-demo-owner-paperboat", email: "owner.paperboat.demo@example.test", userName: "Rhea Fictional" },
  { id: distributorOrgIds[3], slug: "demo-lantern", name: "Lantern Drug House", proprietor: "Omar Placeholder", phone: "9100000004", userId: otherDistributorUserIds[2], subject: "medstock-demo-owner-lantern", email: "owner.lantern.demo@example.test", userName: "Omar Placeholder" },
  { id: distributorOrgIds[4], slug: "demo-marble-creek", name: "Marble Creek Distributors", proprietor: "Tara Invented", phone: "9100000005", userId: otherDistributorUserIds[3], subject: "medstock-demo-owner-marble", email: "owner.marble.demo@example.test", userName: "Tara Invented" },
];

type MedicineSeed = {
  id: number;
  displayName: string;
  brandName: string;
  genericName: string;
  dosageForm: string;
  presentation: string;
  salt: string;
  strength: string;
  unit: StrengthUnit;
  pack: string;
  quantity: string;
  packUnit: PackUnit;
  price: string;
  stock: StockStatus;
  quantityOnHand: string | null;
  distributor: number;
};

const medicines: MedicineSeed[] = [
  { id: 1, displayName: "Northwind Sampletab 500", brandName: "Northwind Sampletab", genericName: "Paracetamol", dosageForm: "Tablet", presentation: "Strip", salt: "Paracetamol", strength: "500", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "18.50", stock: StockStatus.IN_STOCK, quantityOnHand: "240", distributor: 0 },
  { id: 2, displayName: "Harbor Samplefen 200", brandName: "Harbor Samplefen", genericName: "Ibuprofen", dosageForm: "Tablet", presentation: "Strip", salt: "Ibuprofen", strength: "200", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "24.00", stock: StockStatus.LOW_STOCK, quantityOnHand: "30", distributor: 1 },
  { id: 3, displayName: "Lantern Samplecillin 250", brandName: "Lantern Samplecillin", genericName: "Amoxicillin", dosageForm: "Capsule", presentation: "Blister", salt: "Amoxicillin", strength: "250", unit: StrengthUnit.MG, pack: "Strip of 10 capsules", quantity: "10", packUnit: PackUnit.CAPSULE, price: "64.00", stock: StockStatus.IN_STOCK, quantityOnHand: "120", distributor: 2 },
  { id: 4, displayName: "Kite Samplezole 20", brandName: "Kite Samplezole", genericName: "Omeprazole", dosageForm: "Capsule", presentation: "Bottle", salt: "Omeprazole", strength: "20", unit: StrengthUnit.MG, pack: "Bottle of 10 capsules", quantity: "10", packUnit: PackUnit.CAPSULE, price: "42.75", stock: StockStatus.IN_STOCK, quantityOnHand: "80", distributor: 3 },
  { id: 5, displayName: "Marble Samplepril 5", brandName: "Marble Samplepril", genericName: "Enalapril", dosageForm: "Tablet", presentation: "Strip", salt: "Enalapril", strength: "5", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "31.00", stock: StockStatus.OUT_OF_STOCK, quantityOnHand: "0", distributor: 4 },
  { id: 6, displayName: "Sable Samplemet 500", brandName: "Sable Samplemet", genericName: "Metformin", dosageForm: "Tablet", presentation: "Strip", salt: "Metformin", strength: "500", unit: StrengthUnit.MG, pack: "Strip of 15 tablets", quantity: "15", packUnit: PackUnit.TABLET, price: "22.00", stock: StockStatus.IN_STOCK, quantityOnHand: "300", distributor: 0 },
  { id: 7, displayName: "Paperboat Samplestatin 10", brandName: "Paperboat Samplestatin", genericName: "Atorvastatin", dosageForm: "Tablet", presentation: "Strip", salt: "Atorvastatin", strength: "10", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "55.25", stock: StockStatus.LOW_STOCK, quantityOnHand: "18", distributor: 1 },
  { id: 8, displayName: "Northwind Sampledine 150", brandName: "Northwind Sampledine", genericName: "Ranitidine", dosageForm: "Tablet", presentation: "Strip", salt: "Ranitidine", strength: "150", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "19.00", stock: StockStatus.UNKNOWN, quantityOnHand: null, distributor: 2 },
  { id: 9, displayName: "Harbor Samplecef 200", brandName: "Harbor Samplecef", genericName: "Cefixime", dosageForm: "Tablet", presentation: "Strip", salt: "Cefixime", strength: "200", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "96.00", stock: StockStatus.IN_STOCK, quantityOnHand: "60", distributor: 3 },
  { id: 10, displayName: "Lantern Samplecet Syrup", brandName: "Lantern Samplecet", genericName: "Paracetamol", dosageForm: "Syrup", presentation: "Bottle", salt: "Paracetamol", strength: "125", unit: StrengthUnit.MG, pack: "Bottle of 60 ml", quantity: "60", packUnit: PackUnit.ML, price: "48.00", stock: StockStatus.IN_STOCK, quantityOnHand: "40", distributor: 4 },
  { id: 11, displayName: "Kite Samplezinc 20", brandName: "Kite Samplezinc", genericName: "Zinc sulfate", dosageForm: "Tablet", presentation: "Strip", salt: "Zinc sulfate", strength: "20", unit: StrengthUnit.MG, pack: "Strip of 10 tablets", quantity: "10", packUnit: PackUnit.TABLET, price: "27.50", stock: StockStatus.IN_STOCK, quantityOnHand: "90", distributor: 0 },
  { id: 12, displayName: "Marble Samplevite Drops", brandName: "Marble Samplevite", genericName: "Ascorbic acid", dosageForm: "Drops", presentation: "Bottle", salt: "Ascorbic acid", strength: "100", unit: StrengthUnit.MG, pack: "Bottle of 15 ml", quantity: "15", packUnit: PackUnit.ML, price: "36.00", stock: StockStatus.LOW_STOCK, quantityOnHand: "12", distributor: 1 },
  { id: 13, displayName: "Sable Samplecough Syrup", brandName: "Sable Samplecough", genericName: "Dextromethorphan", dosageForm: "Syrup", presentation: "Bottle", salt: "Dextromethorphan", strength: "10", unit: StrengthUnit.MG, pack: "Bottle of 100 ml", quantity: "100", packUnit: PackUnit.ML, price: "72.00", stock: StockStatus.IN_STOCK, quantityOnHand: "25", distributor: 2 },
  { id: 14, displayName: "Paperboat Sampleors", brandName: "Paperboat Sampleors", genericName: "Oral rehydration salts", dosageForm: "Powder", presentation: "Sachet", salt: "Sodium chloride", strength: "2.6", unit: StrengthUnit.G, pack: "Sachet of 21 g", quantity: "21", packUnit: PackUnit.G, price: "15.00", stock: StockStatus.IN_STOCK, quantityOnHand: "500", distributor: 3 },
  { id: 15, displayName: "Northwind Samplecream 1%", brandName: "Northwind Samplecream", genericName: "Clotrimazole", dosageForm: "Cream", presentation: "Tube", salt: "Clotrimazole", strength: "1", unit: StrengthUnit.PERCENT, pack: "Tube of 15 g", quantity: "15", packUnit: PackUnit.G, price: "39.00", stock: StockStatus.OUT_OF_STOCK, quantityOnHand: "0", distributor: 4 },
];

export async function clearDemoDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.procurementEnquiryAuditEvent.deleteMany();
  await prisma.procurementEnquiry.deleteMany();
  await prisma.listingImportRow.deleteMany();
  await prisma.listingImportAuditEvent.deleteMany();
  await prisma.listingAuditEvent.deleteMany();
  await prisma.listingImport.deleteMany();
  await prisma.distributorListing.deleteMany();
  await prisma.medicineSubmissionAuditEvent.deleteMany();
  await prisma.medicineSubmissionIngredient.deleteMany();
  await prisma.medicineSubmissionPack.deleteMany();
  await prisma.medicineSubmission.deleteMany();
  await prisma.medicineComposition.deleteMany();
  await prisma.medicineManufacturer.deleteMany();
  await prisma.medicinePack.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.ingredientAlias.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.manufacturer.deleteMany();
  await prisma.catalogAuditEvent.deleteMany();
  await prisma.distributorProfileAuditEvent.deleteMany();
  await prisma.distributorProfile.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.identityAccount.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

export async function seedDemoDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.organization.upsert({
    where: { id: platformOrgId },
    update: { name: "MedStock Demo Platform", slug: "demo-platform", type: OrganizationType.PLATFORM, status: OrganizationStatus.ACTIVE },
    create: { id: platformOrgId, name: "MedStock Demo Platform", slug: "demo-platform", type: OrganizationType.PLATFORM, status: OrganizationStatus.ACTIVE },
  });
  await prisma.organization.upsert({
    where: { id: retailerOrgId },
    update: { name: "Northwind Chemist", slug: "demo-northwind-chemist", type: OrganizationType.RETAILER, status: OrganizationStatus.ACTIVE },
    create: { id: retailerOrgId, name: "Northwind Chemist", slug: "demo-northwind-chemist", type: OrganizationType.RETAILER, status: OrganizationStatus.ACTIVE },
  });
  await prisma.organization.upsert({
    where: { id: secondRetailerOrgId },
    update: { name: "Harbor Lane Pharmacy", slug: "demo-harbor-lane", type: OrganizationType.RETAILER, status: OrganizationStatus.ACTIVE },
    create: { id: secondRetailerOrgId, name: "Harbor Lane Pharmacy", slug: "demo-harbor-lane", type: OrganizationType.RETAILER, status: OrganizationStatus.ACTIVE },
  });
  await upsertUser(prisma, retailerUserId, demoPersonas.retailer.email, demoPersonas.retailer.name, demoPersonas.retailer.subject);
  await upsertUser(prisma, secondRetailerUserId, "retailer.two.demo@example.test", "Isha Sample", "medstock-demo-retailer-two");
  await upsertUser(prisma, adminUserId, demoPersonas.administrator.email, demoPersonas.administrator.name, demoPersonas.administrator.subject);
  await membership(prisma, demoUuid(301), retailerUserId, retailerOrgId, MembershipRole.RETAILER_OWNER);
  await membership(prisma, demoUuid(302), secondRetailerUserId, secondRetailerOrgId, MembershipRole.RETAILER_OWNER);
  await membership(prisma, demoUuid(303), adminUserId, platformOrgId, MembershipRole.PLATFORM_ADMIN);

  for (const distributor of distributors) {
    await prisma.organization.upsert({
      where: { id: distributor.id },
      update: { name: distributor.name, slug: distributor.slug, type: OrganizationType.DISTRIBUTOR, status: OrganizationStatus.ACTIVE },
      create: { id: distributor.id, name: distributor.name, slug: distributor.slug, type: OrganizationType.DISTRIBUTOR, status: OrganizationStatus.ACTIVE },
    });
    await upsertUser(prisma, distributor.userId, distributor.email, distributor.userName, distributor.subject);
    await membership(prisma, distributor.userId.replace("10000000-0000-4000-8000-", "10000000-0000-4000-8001-"), distributor.userId, distributor.id, MembershipRole.DISTRIBUTOR_OWNER);
    await prisma.distributorProfile.upsert({
      where: { organizationId: distributor.id },
      update: { proprietorName: distributor.proprietor, mobileNumber: distributor.phone, publishedAt: new Date() },
      create: { organizationId: distributor.id, proprietorName: distributor.proprietor, mobileNumber: distributor.phone, publishedAt: new Date() },
    });
  }

  await prisma.manufacturer.upsert({
    where: { id: manufacturerId },
    update: { canonicalName: "Fictional Sample Labs", normalizedName: "fictional sample labs", countryCode: "IN" },
    create: { id: manufacturerId, canonicalName: "Fictional Sample Labs", normalizedName: "fictional sample labs", countryCode: "IN" },
  });

  const saltIds = new Map<string, string>();
  for (const [index, medicine] of medicines.entries()) {
    const saltKey = normalizeCatalogName(medicine.salt);
    let saltId = saltIds.get(saltKey);
    if (!saltId) {
      const ingredient = await prisma.ingredient.upsert({
        where: { normalizedName: saltKey },
        update: { canonicalName: medicine.salt, kind: IngredientKind.SALT },
        create: { id: demoUuid(400 + index), canonicalName: medicine.salt, normalizedName: saltKey, kind: IngredientKind.SALT },
      });
      saltId = ingredient.id;
      saltIds.set(saltKey, saltId);
    }
    const medicineId = demoUuid(500 + medicine.id);
    const packId = demoUuid(600 + medicine.id);
    const normalized = normalizeCatalogName(medicine.displayName);
    await prisma.medicine.upsert({
      where: { id: medicineId },
      update: {
        displayName: medicine.displayName,
        normalizedDisplayName: normalized,
        brandName: medicine.brandName,
        genericName: medicine.genericName,
        dosageForm: medicine.dosageForm,
        presentation: medicine.presentation,
        status: CatalogStatus.PUBLISHED,
        searchVisible: true,
        sourceLabel: "illustrative-demo",
        sourceReference: "illustrative-demo",
        searchText: `${medicine.displayName} ${medicine.genericName} ${medicine.salt} illustrative sample`.toLowerCase(),
      },
      create: {
        id: medicineId,
        displayName: medicine.displayName,
        normalizedDisplayName: normalized,
        brandName: medicine.brandName,
        genericName: medicine.genericName,
        dosageForm: medicine.dosageForm,
        presentation: medicine.presentation,
        status: CatalogStatus.PUBLISHED,
        searchVisible: true,
        sourceLabel: "illustrative-demo",
        sourceReference: "illustrative-demo",
        searchText: `${medicine.displayName} ${medicine.genericName} ${medicine.salt} illustrative sample`.toLowerCase(),
      },
    });
    await prisma.medicineComposition.upsert({
      where: { medicineId_ingredientId: { medicineId, ingredientId: saltId } },
      update: { strengthValue: medicine.strength, strengthUnit: medicine.unit, sequence: 1 },
      create: { id: demoUuid(700 + medicine.id), medicineId, ingredientId: saltId, strengthValue: medicine.strength, strengthUnit: medicine.unit, sequence: 1 },
    });
    await prisma.medicinePack.upsert({
      where: { medicineId_description: { medicineId, description: medicine.pack } },
      update: { quantity: medicine.quantity, unit: medicine.packUnit },
      create: { id: packId, medicineId, description: medicine.pack, quantity: medicine.quantity, unit: medicine.packUnit },
    });
    await prisma.medicineManufacturer.upsert({
      where: { medicineId_manufacturerId_role: { medicineId, manufacturerId, role: MedicineCompanyRole.MANUFACTURER } },
      update: {},
      create: { id: demoUuid(800 + medicine.id), medicineId, manufacturerId, role: MedicineCompanyRole.MANUFACTURER },
    });
    const organizationId = required(distributorOrgIds[medicine.distributor], "listing distributor");
    const listingId = demoUuid(900 + medicine.id);
    await prisma.distributorListing.upsert({
      where: { organizationId_medicinePackId: { organizationId, medicinePackId: packId } },
      update: {
        status: ListingStatus.ACTIVE,
        unitPrice: medicine.price,
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "1",
        stockStatus: medicine.stock,
        availableQuantity: medicine.quantityOnHand,
        source: ListingSource.MANUAL,
        sourceNote: illustrative,
        priceUpdatedAt: new Date(),
        stockUpdatedAt: new Date(),
      },
      create: {
        id: listingId,
        organizationId,
        medicinePackId: packId,
        status: ListingStatus.ACTIVE,
        unitPrice: medicine.price,
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "1",
        stockStatus: medicine.stock,
        availableQuantity: medicine.quantityOnHand,
        source: ListingSource.MANUAL,
        sourceNote: illustrative,
        priceUpdatedAt: new Date(),
        stockUpdatedAt: new Date(),
      },
    });
  }

  const openListingId = demoUuid(901);
  const respondedListingId = demoUuid(902);
  await prisma.procurementEnquiry.upsert({
    where: { id: demoUuid(1001) },
    update: { status: EnquiryStatus.OPEN, message: "Illustrative request for the sample strip. Not a real purchase order." },
    create: {
      id: demoUuid(1001),
      retailerOrganizationId: retailerOrgId,
      distributorOrganizationId: distributorOrgIds[0],
      listingId: openListingId,
      requestedQuantity: 4,
      message: "Illustrative request for the sample strip. Not a real purchase order.",
      status: EnquiryStatus.OPEN,
      createdByUserId: retailerUserId,
    },
  });
  await prisma.procurementEnquiry.upsert({
    where: { id: demoUuid(1002) },
    update: {
      status: EnquiryStatus.RESPONDED,
      responseMessage: "Illustrative reply. Stock shown here is sample data.",
      respondedByUserId: otherDistributorUserIds[0],
    },
    create: {
      id: demoUuid(1002),
      retailerOrganizationId: retailerOrgId,
      distributorOrganizationId: required(distributorOrgIds[1], "responded enquiry distributor"),
      listingId: respondedListingId,
      requestedQuantity: 2,
      message: "Illustrative request for the second sample pack.",
      status: EnquiryStatus.RESPONDED,
      responseMessage: "Illustrative reply. Stock shown here is sample data.",
      respondedByUserId: otherDistributorUserIds[0],
      respondedAt: new Date(),
      createdByUserId: retailerUserId,
    },
  });
  await prisma.procurementEnquiryAuditEvent.upsert({
    where: { id: demoUuid(1101) },
    update: { action: "enquiry.create" },
    create: {
      id: demoUuid(1101),
      actorUserId: retailerUserId,
      retailerOrganizationId: retailerOrgId,
      distributorOrganizationId: distributorOrgIds[0],
      enquiryId: demoUuid(1001),
      action: "enquiry.create",
    },
  });
  await prisma.procurementEnquiryAuditEvent.upsert({
    where: { id: demoUuid(1102) },
    update: { action: "enquiry.respond" },
    create: {
      id: demoUuid(1102),
      actorUserId: required(otherDistributorUserIds[0], "enquiry audit actor"),
      retailerOrganizationId: retailerOrgId,
      distributorOrganizationId: required(distributorOrgIds[1], "responded enquiry distributor"),
      enquiryId: demoUuid(1002),
      action: "enquiry.respond",
    },
  });

  const pendingId = demoUuid(1201);
  const approvedId = demoUuid(1202);
  const rejectedId = demoUuid(1203);
  await upsertSubmission(prisma, {
    id: pendingId,
    displayName: "Pending Samplemist 10",
    genericName: "Samplemist",
    status: MedicineSubmissionStatus.PENDING_REVIEW,
    salt: "Samplemist",
  });
  await upsertSubmission(prisma, {
    id: approvedId,
    displayName: "Approved Sampletone 5",
    genericName: "Sampletone",
    status: MedicineSubmissionStatus.APPROVED,
    salt: "Sampletone",
    reviewedByUserId: adminUserId,
    approvedMedicineId: demoUuid(501),
  });
  await upsertSubmission(prisma, {
    id: rejectedId,
    displayName: "Rejected Sampledrop",
    genericName: "Sampledrop",
    status: MedicineSubmissionStatus.REJECTED,
    salt: "Sampledrop",
    reviewedByUserId: adminUserId,
    reviewReason: "Illustrative rejection. The sample record did not include a distinct pack.",
  });
  await prisma.medicineSubmissionAuditEvent.upsert({
    where: { id: demoUuid(1301) },
    update: { action: "submission.approve" },
    create: {
      id: demoUuid(1301),
      actorUserId: adminUserId,
      organizationId: distributorOrgIds[0],
      submissionId: approvedId,
      action: "submission.approve",
    },
  });
  await prisma.medicineSubmissionAuditEvent.upsert({
    where: { id: demoUuid(1302) },
    update: { action: "submission.reject" },
    create: {
      id: demoUuid(1302),
      actorUserId: adminUserId,
      organizationId: distributorOrgIds[0],
      submissionId: rejectedId,
      action: "submission.reject",
    },
  });
  await prisma.catalogAuditEvent.upsert({
    where: { id: demoUuid(1401) },
    update: { action: "catalog.publish" },
    create: {
      id: demoUuid(1401),
      actorUserId: adminUserId,
      action: "catalog.publish",
      entityType: "medicine",
      entityId: demoUuid(501),
    },
  });
}

async function upsertUser(
  prisma: PrismaClient,
  id: string,
  email: string,
  name: string,
  subject: string,
): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    update: { email, name, status: UserStatus.ACTIVE },
    create: { id, email, name, status: UserStatus.ACTIVE },
  });
  await prisma.identityAccount.upsert({
    where: { provider_providerSubject: { provider: IdentityProvider.COGNITO, providerSubject: subject } },
    update: { userId: id },
    create: { id: id.replace("10000000-0000-4000-8000-", "10000000-0000-4000-8002-"), userId: id, provider: IdentityProvider.COGNITO, providerSubject: subject },
  });
}

async function membership(
  prisma: PrismaClient,
  id: string,
  userId: string,
  organizationId: string,
  role: MembershipRole,
): Promise<void> {
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    update: { role, status: MembershipStatus.ACTIVE },
    create: { id, userId, organizationId, role, status: MembershipStatus.ACTIVE },
  });
}

async function upsertSubmission(
  prisma: PrismaClient,
  input: {
    id: string;
    displayName: string;
    genericName: string;
    status: MedicineSubmissionStatus;
    salt: string;
    reviewedByUserId?: string;
    approvedMedicineId?: string;
    reviewReason?: string;
  },
): Promise<void> {
  const organizationId = required(distributorOrgIds[0], "submission distributor");
  await prisma.medicineSubmission.upsert({
    where: { id: input.id },
    update: {
      status: input.status,
      reviewReason: input.reviewReason ?? null,
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: input.reviewedByUserId ? new Date() : null,
      approvedMedicineId: input.approvedMedicineId ?? null,
      sourceNote: illustrative,
    },
    create: {
      id: input.id,
      organizationId,
      submittedByUserId: distributorUserId,
      status: input.status,
      displayName: input.displayName,
      normalizedDisplayName: normalizeCatalogName(input.displayName),
      brandName: input.displayName,
      genericName: input.genericName,
      dosageForm: "Tablet",
      presentation: "Strip",
      manufacturerName: "Fictional Sample Labs",
      indicativeUnitPrice: "20.00",
      minimumOrderQuantity: "1",
      stockStatus: StockStatus.UNKNOWN,
      sourceNote: illustrative,
      reviewReason: input.reviewReason ?? null,
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: input.reviewedByUserId ? new Date() : null,
      approvedMedicineId: input.approvedMedicineId ?? null,
    },
  });
  await prisma.medicineSubmissionIngredient.upsert({
    where: { submissionId_sequence: { submissionId: input.id, sequence: 1 } },
    update: { ingredientName: input.salt, normalizedName: normalizeCatalogName(input.salt) },
    create: {
      id: input.id.replace("10000000-0000-4000-8000-", "10000000-0000-4000-8003-"),
      submissionId: input.id,
      ingredientName: input.salt,
      normalizedName: normalizeCatalogName(input.salt),
      kind: IngredientKind.SALT,
      strengthValue: "10",
      strengthUnit: StrengthUnit.MG,
      sequence: 1,
    },
  });
  await prisma.medicineSubmissionPack.upsert({
    where: { submissionId_description: { submissionId: input.id, description: "Strip of 10 tablets" } },
    update: { quantity: "10", unit: PackUnit.TABLET },
    create: {
      id: input.id.replace("10000000-0000-4000-8000-", "10000000-0000-4000-8004-"),
      submissionId: input.id,
      description: "Strip of 10 tablets",
      quantity: "10",
      unit: PackUnit.TABLET,
    },
  });
}
