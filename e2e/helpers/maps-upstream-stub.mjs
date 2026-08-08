import http from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.MAPS_STUB_PORT ?? 4199);

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/health") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/geocode/forward") {
    json(response, 200, {
      features: [
        {
          id: "place.damascus",
          geometry: { coordinates: [36.2765, 33.5138] },
          properties: {
            name: "دمشق",
            full_address: "دمشق، سوريا",
            coordinates: { longitude: 36.2765, latitude: 33.5138 },
            context: {
              place: { name: "دمشق" },
              country: { country_code: "sy" },
            },
          },
        },
      ],
    });
    return;
  }

  if (url.pathname === "/geocode/reverse") {
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    json(response, 200, {
      features: [
        {
          id: "address.hasaniya",
          properties: {
            name: "الحسنية",
            full_address: "الحسنية، ريف دمشق، سوريا",
            coordinates: { longitude, latitude },
            context: {
              place: { name: "ريف دمشق" },
              country: { country_code: "sy" },
            },
          },
        },
      ],
    });
    return;
  }

  if (url.pathname.startsWith("/directions/")) {
    const encoded = decodeURIComponent(url.pathname.slice("/directions/".length));
    const [pickup, dropoff] = encoded.split(";");
    const [pickupLongitude, pickupLatitude] = pickup.split(",").map(Number);
    const [dropoffLongitude, dropoffLatitude] = dropoff.split(",").map(Number);
    json(response, 200, {
      routes: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [pickupLongitude, pickupLatitude],
              [35.85, 33.67],
              [dropoffLongitude, dropoffLatitude],
            ],
          },
          distance: 123400,
          duration: 9000,
        },
      ],
    });
    return;
  }

  json(response, 404, { error: "not found" });
});

server.listen(port, host, () => {
  process.stdout.write(`maps stub listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
