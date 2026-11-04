import { IngredientKind, PackUnit, StrengthUnit, createPrismaClient } from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";

const prisma = createPrismaClient(databaseUrl);
const testRun = `catalog-${Date.now()}`;

function name(label: string): string {
  return `${label} ${testRun}`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.medicineComposition.deleteMany({
    where: { medicine: { normalizedDisplayName: { contains: testRun } } },
  });
  await prisma.medicinePack.deleteMany({
    where: { medicine: { normalizedDisplayName: { contains: testRun } } },
  });
  await prisma.medicineManufacturer.deleteMany({
    where: { medicine: { normalizedDisplayName: { contains: testRun } } },
  });
  await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
  await prisma.ingredientAlias.deleteMany({ where: { normalizedAlias: { contains: testRun } } });
  await prisma.ingredient.deleteMany({ where: { normalizedName: { contains: testRun } } });
  await prisma.manufacturer.deleteMany({ where: { normalizedName: { contains: testRun } } });
});

describe("catalog records", () => {
  it("keeps multiple ingredients, packs, and shared ingredients", async () => {
    const paracetamol = await prisma.ingredient.create({
      data: {
        canonicalName: name("Paracetamol"),
        normalizedName: name("paracetamol").toLowerCase(),
        kind: IngredientKind.ACTIVE,
      },
    });
    const caffeine = await prisma.ingredient.create({
      data: {
        canonicalName: name("Caffeine"),
        normalizedName: name("caffeine").toLowerCase(),
        kind: IngredientKind.ACTIVE,
      },
    });
    const first = await medicine("First");
    const second = await medicine("Second");
    await prisma.medicineComposition.create({
      data: {
        medicineId: first.id,
        ingredientId: paracetamol.id,
        strengthValue: "500.5",
        strengthUnit: StrengthUnit.MG,
        sequence: 1,
      },
    });
    await prisma.medicineComposition.create({
      data: {
        medicineId: first.id,
        ingredientId: caffeine.id,
        strengthValue: "30",
        strengthUnit: StrengthUnit.MG,
        basis: "per tablet",
        sequence: 2,
      },
    });
    await prisma.medicineComposition.create({
      data: {
        medicineId: second.id,
        ingredientId: paracetamol.id,
        strengthValue: "650",
        strengthUnit: StrengthUnit.MG,
        sequence: 1,
      },
    });
    await prisma.medicinePack.createMany({
      data: [
        {
          medicineId: first.id,
          description: name("Strip of 10"),
          quantity: "10",
          unit: PackUnit.TABLET,
        },
        {
          medicineId: first.id,
          description: name("Strip of 15"),
          quantity: "15",
          unit: PackUnit.TABLET,
        },
      ],
    });

    const stored = await prisma.medicineComposition.findFirstOrThrow({
      where: { medicineId: first.id, ingredientId: paracetamol.id },
    });
    expect(stored.strengthValue.toString()).toBe("500.5");
    expect(stored.strengthUnit).toBe(StrengthUnit.MG);
    expect(await prisma.medicineComposition.count({ where: { ingredientId: paracetamol.id } })).toBe(
      2,
    );
    expect(await prisma.medicinePack.count({ where: { medicineId: first.id } })).toBe(2);
    expect(await prisma.medicineComposition.count({ where: { medicineId: first.id } })).toBe(2);
  });

  it("rejects duplicate normalized names and restricted deletes", async () => {
    const ingredient = await prisma.ingredient.create({
      data: {
        canonicalName: name("Ibuprofen"),
        normalizedName: name("ibuprofen").toLowerCase(),
      },
    });
    await expect(
      prisma.ingredient.create({
        data: {
          canonicalName: name("IBUPROFEN"),
          normalizedName: name("ibuprofen").toLowerCase(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const row = await medicine("Bound");
    await prisma.medicineComposition.create({
      data: {
        medicineId: row.id,
        ingredientId: ingredient.id,
        strengthValue: "200",
        strengthUnit: StrengthUnit.MG,
        sequence: 1,
      },
    });
    await expect(prisma.ingredient.delete({ where: { id: ingredient.id } })).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(prisma.medicine.delete({ where: { id: row.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  async function medicine(label: string) {
    const displayName = name(label);
    return prisma.medicine.create({
      data: {
        displayName,
        normalizedDisplayName: displayName.toLowerCase(),
        genericName: name("Generic"),
        dosageForm: "Tablet",
      },
    });
  }
});
