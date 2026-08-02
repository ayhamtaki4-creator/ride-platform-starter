export type TestRole = "admin" | "rider" | "driver";

type Credentials = {
  email: string;
  password: string;
  home: string;
};

const defaultPassword =
  process.env.E2E_DEFAULT_PASSWORD ?? "ChangeMe123!";

export const accounts: Record<TestRole, Credentials> = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.E2E_ADMIN_PASSWORD ?? defaultPassword,
    home: "/admin",
  },
  rider: {
    email: process.env.E2E_RIDER_EMAIL ?? "rider@example.com",
    password: process.env.E2E_RIDER_PASSWORD ?? defaultPassword,
    home: "/rider",
  },
  driver: {
    email: process.env.E2E_DRIVER_EMAIL ?? "driver@example.com",
    password: process.env.E2E_DRIVER_PASSWORD ?? defaultPassword,
    home: "/driver",
  },
};

export const apiBaseURL =
  process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api";
