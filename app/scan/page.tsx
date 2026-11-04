import type { Metadata } from "next";
import { Scanner } from "@/components/Scanner";
import { NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Check your wallets, ${NAME}` };

export default function ScanPage() {
  return <Scanner />;
}
