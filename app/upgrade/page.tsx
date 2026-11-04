import type { Metadata } from "next";
import { Suspense } from "react";
import { Upgrade } from "@/components/Upgrade";
import { NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Upgrade your NEAR account, ${NAME}` };

export default function UpgradePage() {
  return (
    <Suspense>
      <Upgrade />
    </Suspense>
  );
}
