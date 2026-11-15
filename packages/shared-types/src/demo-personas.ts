export const demoPersonas = {
  retailer: {
    subject: "medstock-demo-retailer",
    email: "retailer.demo@example.test",
    name: "Meera Sample",
  },
  distributor: {
    subject: "medstock-demo-distributor",
    email: "distributor.demo@example.test",
    name: "Arun Example",
  },
  administrator: {
    subject: "medstock-demo-administrator",
    email: "administrator.demo@example.test",
    name: "Kavita Demo",
  },
} as const;

export type DemoPersona = keyof typeof demoPersonas;

export function demoPersonaKey(value: unknown): DemoPersona | null {
  if (value === "retailer" || value === "distributor" || value === "administrator") {
    return value;
  }
  return null;
}
