import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

test.describe("Vehicle primary image", () => {
  test("admin can select an approved vehicle image as primary", async ({ request }) => {
    const adminToken = await apiLogin(request, "admin");
    const prisma = new PrismaClient();
    let firstImageId = "";
    let secondImageId = "";
    let vehicleId = "";
    let driverId = "";
    let previousPrimaryImageUrl: string | null = null;
    let previousPrimaryImageMediaId: string | null = null;
    let previousPrimaryImageIds: string[] = [];

    try {
      const vehicle = await prisma.vehicle.findFirst({
        where: { isActive: true },
        include: { driverProfile: { select: { userId: true } } },
      });
      expect(vehicle, "Seeded active vehicle is required").toBeTruthy();
      vehicleId = vehicle!.id;
      driverId = vehicle!.driverProfile.userId;
      previousPrimaryImageUrl = vehicle!.primaryImageUrl;
      previousPrimaryImageMediaId = vehicle!.primaryImageMediaId;
      previousPrimaryImageIds = (
        await prisma.vehicleImage.findMany({
          where: { vehicleId, isPrimary: true },
          select: { id: true },
        })
      ).map((image) => image.id);

      const marker = Date.now();
      const first = await prisma.vehicleImage.create({
        data: {
          vehicleId,
          url: `https://example.test/vehicle-${marker}-1.jpg`,
          isApproved: true,
          isPrimary: true,
          sortOrder: 100,
        },
      });
      const second = await prisma.vehicleImage.create({
        data: {
          vehicleId,
          url: `https://example.test/vehicle-${marker}-2.jpg`,
          isApproved: true,
          isPrimary: false,
          sortOrder: 101,
        },
      });
      firstImageId = first.id;
      secondImageId = second.id;

      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { primaryImageMediaId: null, primaryImageUrl: first.url },
      });

      const response = await request.patch(
        `${apiBaseURL}/admin/drivers/${driverId}/vehicles/${vehicleId}/media-images/${secondImageId}/primary`,
        { headers: bearer(adminToken) },
      );
      expect(response.status(), await response.text()).toBe(200);

      const [updatedVehicle, images] = await Promise.all([
        prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
        prisma.vehicleImage.findMany({
          where: { id: { in: [firstImageId, secondImageId] } },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

      expect(updatedVehicle.primaryImageUrl).toBe(second.url);
      expect(updatedVehicle.primaryImageMediaId).toBeNull();
      expect(images.find((image) => image.id === firstImageId)?.isPrimary).toBe(false);
      expect(images.find((image) => image.id === secondImageId)?.isPrimary).toBe(true);
    } finally {
      if (vehicleId) {
        await prisma.vehicleImage.updateMany({
          where: { vehicleId },
          data: { isPrimary: false },
        }).catch(() => undefined);
        if (previousPrimaryImageIds.length) {
          await prisma.vehicleImage.updateMany({
            where: { id: { in: previousPrimaryImageIds } },
            data: { isPrimary: true },
          }).catch(() => undefined);
        }
      }
      if (firstImageId || secondImageId) {
        await prisma.vehicleImage.deleteMany({
          where: { id: { in: [firstImageId, secondImageId].filter(Boolean) } },
        });
      }
      if (vehicleId) {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: {
            primaryImageUrl: previousPrimaryImageUrl,
            primaryImageMediaId: previousPrimaryImageMediaId,
          },
        }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
