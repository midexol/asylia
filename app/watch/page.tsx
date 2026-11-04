import type { Metadata } from "next";
import { Watch } from "@/components/Watch";
import { NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `The watchman, ${NAME}` };

export default function WatchPage() {
  return <Watch />;
}
