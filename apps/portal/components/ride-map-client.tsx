"use client";

import dynamic from "next/dynamic";
import type { RideMapProps } from "./ride-map";

const DynamicRideMap = dynamic(() => import("./ride-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      جارٍ تحميل الخريطة...
    </div>
  ),
});

export function RideMapClient(props: RideMapProps) {
  return (
    <>
      <link rel="stylesheet" href="/vendor/leaflet.css" precedence="route-vendor" />
      <DynamicRideMap {...props} />
    </>
  );
}