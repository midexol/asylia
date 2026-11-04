import type { Metadata } from "next";
import { Suspense } from "react";
import { Sealer } from "@/components/Sealer";
import { NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Seal an escape, ${NAME}` };

export default function SealPage() {
  return (
    <Suspense>
      <Sealer />
    </Suspense>
  );
}
