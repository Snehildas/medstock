import { Badge } from "@/components/ui/badge";
import {
  enquiryStatusLabel,
  freshnessLabel,
  importStatusLabel,
  listingStatusLabel,
  stockStatusLabel,
} from "@/lib/labels";

export function StockBadge({ status }: { status: string }) {
  const tone = status === "IN_STOCK" ? "success" : status === "LOW_STOCK" ? "warning" : status === "OUT_OF_STOCK" ? "danger" : "neutral";
  return <Badge tone={tone}>{stockStatusLabel(status)}</Badge>;
}

export function ListingBadge({ status }: { status: string }) {
  const tone = status === "ACTIVE" ? "success" : status === "PAUSED" ? "warning" : status === "SUSPENDED" ? "danger" : "neutral";
  return <Badge tone={tone}>{listingStatusLabel(status)}</Badge>;
}

export function EnquiryBadge({ status }: { status: string }) {
  const tone = status === "OPEN" ? "info" : status === "RESPONDED" ? "success" : "neutral";
  return <Badge tone={tone}>{enquiryStatusLabel(status)}</Badge>;
}

export function FreshnessBadge({ value }: { value: string }) {
  const tone = value === "FRESH" ? "success" : value === "STALE" ? "warning" : "neutral";
  return <Badge tone={tone}>{freshnessLabel(value)}</Badge>;
}

export function ImportBadge({ status }: { status: string }) {
  const tone =
    status === "COMMITTED" ? "success" : status === "PREVIEW_READY" ? "info" : status === "FAILED" ? "danger" : "neutral";
  return <Badge tone={tone}>{importStatusLabel(status)}</Badge>;
}
