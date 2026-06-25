import type { Vehicle } from "@/lib/types";
import { getVehicleExpiryTags } from "@/lib/vehicles";
import { resolveInsuranceExpiry } from "@/lib/documents";
import { VehicleExpiryTag } from "@/components/VehicleExpiryTag";

interface VehicleExpiryTagsProps {
  vehicle: Vehicle;
  insuranceExpiry?: string;
}

export function VehicleExpiryTags({
  vehicle,
  insuranceExpiry,
}: VehicleExpiryTagsProps) {
  const tags = getVehicleExpiryTags(
    vehicle,
    insuranceExpiry ?? resolveInsuranceExpiry(vehicle),
  );
  if (tags.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <VehicleExpiryTag key={tag.type} tag={tag} />
      ))}
    </div>
  );
}
