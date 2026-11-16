import { Suspense } from "react";
import PartyForm from "@/components/party-form";
export default function Page() {
  return (
    <Suspense>
      <PartyForm />
    </Suspense>
  );
}
