import http from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.MAPS_STUB_PORT ?? 4199);
const counters = {
  forward: 0,
  reverse: 0,
  directions: 0,
};
const requestCounts = Object.create(null);

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function bump(key) {
  requestCounts[key] = (requestCounts[key] ?? 0) + 1;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/health") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/stats") {
    json(response, 200, { ...counters, requests: { ...requestCounts } });
    return;
  }

  if (url.pathname === "/geocode/forward") {
    counters.forward += 1;
    bump(`forward:${url.searchParams.get("q") ?? ""}`);
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
    counters.reverse += 1;
    const latitudeText = url.searchParams.get("latitude") ?? "";
    const longitudeText = url.searchParams.get("longitude") ?? "";
    bump(`reverse:${latitudeText},${longitudeText}`);
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
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
    counters.directions += 1;
    const encoded = decodeURIComponent(url.pathname.slice("/directions/".length));
    bump(`directions:${encoded}`);
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
