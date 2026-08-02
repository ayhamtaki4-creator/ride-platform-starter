import { io } from "socket.io-client";

const API_URL = process.env.TEST_API_URL ?? "http://localhost:4000/api";
const REALTIME_URL = process.env.TEST_REALTIME_URL ?? "http://localhost:4000/realtime";

async function request(path, token, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }

  return body;
}

async function login(email) {
  return request("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ email, password: "ChangeMe123!" }),
  });
}

function connect(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(REALTIME_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      timeout: 10000,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`${label}: connection timeout`));
    }, 12000);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(`${label}: ${error.message}`));
    });
  });
}

function waitForEvent(socket, event, predicate = () => true, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);

    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

const sockets = [];
let riderToken;
let createdTripId;

try {
  console.log("1/8 Login accounts...");
  const [adminLogin, riderLogin, driverLogin] = await Promise.all([
    login("admin@example.com"),
    login("rider@example.com"),
    login("driver@example.com"),
  ]);
  riderToken = riderLogin.accessToken;

  console.log("2/8 Connect realtime clients...");
  const [adminSocket, riderSocket, driverSocket] = await Promise.all([
    connect(adminLogin.accessToken, "admin"),
    connect(riderLogin.accessToken, "rider"),
    connect(driverLogin.accessToken, "driver"),
  ]);
  sockets.push(adminSocket, riderSocket, driverSocket);

  console.log("3/8 Put driver online...");
  await request("/drivers/me/availability", driverLogin.accessToken, {
    method: "PATCH",
    body: JSON.stringify({ availability: "ONLINE" }),
  });

  const adminCreatedPromise = waitForEvent(
    adminSocket,
    "admin.trip.created"
  );

  console.log("4/8 Create rider trip and wait for admin event...");
  const trip = await request("/trips", riderLogin.accessToken, {
    method: "POST",
    body: JSON.stringify({
      pickupAddress: "Realtime test pickup",
      pickupLatitude: 33.324,
      pickupLongitude: 44.421,
      dropoffAddress: "Realtime test dropoff",
      dropoffLatitude: 33.315,
      dropoffLongitude: 44.35,
    }),
  });
  createdTripId = trip.id;
  const adminCreated = await adminCreatedPromise;
  if (adminCreated.tripId !== trip.id) {
    throw new Error("Admin received a different trip id.");
  }

  console.log("5/8 Read pending trip and available driver...");
  const [pending, drivers] = await Promise.all([
    request("/admin/trips/pending", adminLogin.accessToken),
    request("/admin/drivers/available", adminLogin.accessToken),
  ]);
  const pendingTrip = pending.find((item) => item.id === trip.id);
  const driver = drivers.find((item) => item.user.email === "driver@example.com");
  if (!pendingTrip || !driver) {
    throw new Error("Pending trip or available driver was not found.");
  }

  const driverAssignedPromise = waitForEvent(
    driverSocket,
    "driver.trip.assigned",
    (event) => event.tripId === trip.id
  );
  const riderAssignedPromise = waitForEvent(
    riderSocket,
    "rider.trip.updated",
    (event) => event.tripId === trip.id && event.status === "DRIVER_ASSIGNED"
  );

  console.log("6/8 Assign driver and verify rider/driver events...");
  await request(
    `/admin/trips/${trip.id}/assign-driver`,
    adminLogin.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ driverId: driver.userId }),
    }
  );
  await Promise.all([driverAssignedPromise, riderAssignedPromise]);

  const driverUnassignedPromise = waitForEvent(
    driverSocket,
    "driver.trip.unassigned",
    (event) => event.tripId === trip.id
  );
  const riderPendingPromise = waitForEvent(
    riderSocket,
    "rider.trip.updated",
    (event) => event.tripId === trip.id && event.status === "PENDING_DISPATCH"
  );

  console.log("7/8 Unassign driver and verify events...");
  await request(
    `/admin/trips/${trip.id}/unassign-driver`,
    adminLogin.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ note: "Automated realtime test" }),
    }
  );
  await Promise.all([driverUnassignedPromise, riderPendingPromise]);

  console.log("8/8 Cancel test trip...");
  await request(`/trips/${trip.id}/cancel`, riderLogin.accessToken, {
    method: "POST",
    body: JSON.stringify({ note: "Realtime test cleanup" }),
  });

  console.log("Realtime dispatch test passed.");
} catch (error) {
  console.error("Realtime dispatch test failed:", error);

  if (riderToken && createdTripId) {
    await request(`/trips/${createdTripId}/cancel`, riderToken, {
      method: "POST",
      body: JSON.stringify({ note: "Realtime test cleanup after failure" }),
    }).catch(() => undefined);
  }

  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
}
