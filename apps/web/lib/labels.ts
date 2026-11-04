const organizationTypes: Record<string, string> = {
  PLATFORM: "Platform",
  RETAILER: "Retailer",
  DISTRIBUTOR: "Distributor",
};

const roles: Record<string, string> = {
  PLATFORM_ADMIN: "Platform admin",
  RETAILER_OWNER: "Retailer owner",
  RETAILER_STAFF: "Retailer staff",
  DISTRIBUTOR_OWNER: "Distributor owner",
  DISTRIBUTOR_STAFF: "Distributor staff",
};

export function organizationTypeLabel(type: string): string {
  return organizationTypes[type] ?? type;
}

export function roleLabel(role: string): string {
  return roles[role] ?? role;
}

const listingStatuses: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
  SUSPENDED: "Suspended",
};

const stockStatuses: Record<string, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  UNKNOWN: "Unknown",
};

const freshness: Record<string, string> = {
  FRESH: "Fresh",
  STALE: "Stale",
  UNKNOWN: "Not reported",
};

const importStatuses: Record<string, string> = {
  PREVIEW_READY: "Preview ready",
  COMMITTED: "Committed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function listingStatusLabel(status: string): string {
  return listingStatuses[status] ?? status;
}

export function stockStatusLabel(status: string): string {
  return stockStatuses[status] ?? status;
}

export function freshnessLabel(value: string): string {
  return freshness[value] ?? value;
}

export function importStatusLabel(status: string): string {
  return importStatuses[status] ?? status;
}

const enquiryStatuses: Record<string, string> = {
  OPEN: "Open",
  RESPONDED: "Responded",
  CLOSED: "Closed",
};

export function enquiryStatusLabel(status: string): string {
  return enquiryStatuses[status] ?? status;
}

export function formatWhen(value: string | null): string {
  if (!value) {
    return "Not completed";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not completed";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
