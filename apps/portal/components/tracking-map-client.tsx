"use client";

import dynamic from "next/dynamic";
import type { TrackingMapProps } from "./tracking-map";

const DynamicTrackingMap = dynamic(() => import("./tracking-map"), {
  ssr: false,
  loading: () => <div className="map-loading" role="status">جارٍ تحميل خريطة الرحلة...</div>,
});

export function TrackingMapClient(props: TrackingMapProps) {
  return (
    <>
      <link rel="stylesheet" href="/vendor/leaflet.css" precedence="route-vendor" />
      <DynamicTrackingMap {...props} />
    </>
  );
}
