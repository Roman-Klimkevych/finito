import { Suspense } from "react";
import { AppContent } from "./_components/AppContent";

export default function Page() {
  // AppContent reads useSearchParams(), which requires a Suspense boundary
  // in the Next.js App Router.
  return (
    <Suspense>
      <AppContent />
    </Suspense>
  );
}
