import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { mockProperties } from "@/lib/mock-data";

export const Route = createFileRoute("/property/$id")({
  head: () => ({ meta: [{ title: "Property — Snapsure" }] }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const property = mockProperties.find((p) => p.id === id);
  return (
    <PageShell
      title={property ? property.address : "Property"}
      subtitle={
        property ? `${property.suburb} ${property.postcode}` : "Property details"
      }
      backTo="/"
    />
  );
}