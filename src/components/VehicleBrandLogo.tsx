"use client";

import { useEffect, useState } from "react";
import type { Vehicle } from "@/lib/types";
import { getVehicleBrandLogoUrl } from "@/lib/brand-logo";

interface VehicleBrandLogoProps {
  vehicle: Vehicle;
  size?: "sm" | "md";
}

const sizes = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
};

export function VehicleBrandLogo({
  vehicle,
  size = "sm",
}: VehicleBrandLogoProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    void getVehicleBrandLogoUrl(vehicle).then((logoUrl) => {
      if (active) setUrl(logoUrl);
    });
    return () => {
      active = false;
    };
  }, [vehicle.brandLogoPath, vehicle.brandLogoStatus, vehicle.id]);

  if (!url) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg bg-black/[0.04] ${sizes[size]}`}
      />
    );
  }

  return (
    <div className={`shrink-0 ${sizes[size]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-contain object-center"
      />
    </div>
  );
}
