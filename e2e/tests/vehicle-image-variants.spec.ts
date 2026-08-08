import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakePng(payloadSize: number, byte: number) {
  return Buffer.concat([pngHeader, Buffer.alloc(payloadSize, byte)]);
}

async function upload(
  request: Parameters<typeof test>[0] extends never ? never : any,
  token: string,
  name: string,
  buffer: Buffer,
  variantKind: "ORIGINAL" | "DISPLAY" | "THUMBNAIL",
  variantOfId?: string,
) {
  const response = await request.post(`${apiBaseURL}/admin/media/upload`, {
    headers: bearer(token),
    multipart: {
      file: { name, mimeType: "image/png", buffer },
      purpose: "VEHICLE_IMAGE",
      visibility: "PUBLIC",
      variantKind,
      ...(variantOfId ? { variantOfId } : {}),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string; variantKind: string; variantOfId: string | null };
}

test.describe("Vehicle image variants", () => {
  test("keeps the original for admin and serves display/thumbnail variants publicly", async ({ request }) => {
    const adminToken = await apiLogin(request, "admin");
    const originalBytes = fakePng(500, 0x11);
    const displayBytes = fakePng(220, 0x22);
    const thumbnailBytes = fakePng(60, 0x33);

    const original = await upload(request, adminToken, "vehicle-original.png", originalBytes, "ORIGINAL");
    expect(original.variantKind).toBe("ORIGINAL");
    expect(original.variantOfId).toBeNull();

    const display = await upload(
      request,
      adminToken,
      "vehicle-display.png",
      displayBytes,
      "DISPLAY",
      original.id,
    );
    const thumbnail = await upload(
      request,
      adminToken,
      "vehicle-thumbnail.png",
      thumbnailBytes,
      "THUMBNAIL",
      original.id,
    );
    expect(display.variantOfId).toBe(original.id);
    expect(thumbnail.variantOfId).toBe(original.id);

    const approve = await request.post(`${apiBaseURL}/admin/media/${original.id}/approve`, {
      headers: bearer(adminToken),
    });
    expect(approve.status(), await approve.text()).toBe(201);

    const displayResponse = await request.get(`${apiBaseURL}/media/public/${original.id}`);
    expect(displayResponse.status(), await displayResponse.text()).toBe(200);
    expect((await displayResponse.body()).length).toBe(displayBytes.length);

    const thumbnailResponse = await request.get(
      `${apiBaseURL}/media/public/${original.id}?variant=thumbnail`,
    );
    expect(thumbnailResponse.status(), await thumbnailResponse.text()).toBe(200);
    expect((await thumbnailResponse.body()).length).toBe(thumbnailBytes.length);

    const adminOriginal = await request.get(`${apiBaseURL}/admin/media/${original.id}/file`, {
      headers: bearer(adminToken),
    });
    expect(adminOriginal.status(), await adminOriginal.text()).toBe(200);
    expect((await adminOriginal.body()).length).toBe(originalBytes.length);

    const mediaList = await request.get(`${apiBaseURL}/admin/media?purpose=VEHICLE_IMAGE`, {
      headers: bearer(adminToken),
    });
    expect(mediaList.status(), await mediaList.text()).toBe(200);
    const listed = (await mediaList.json()) as Array<{ id: string }>;
    expect(listed.some((asset) => asset.id === original.id)).toBe(true);
    expect(listed.some((asset) => asset.id === display.id)).toBe(false);
    expect(listed.some((asset) => asset.id === thumbnail.id)).toBe(false);

    const remove = await request.delete(`${apiBaseURL}/admin/media/${original.id}`, {
      headers: bearer(adminToken),
    });
    expect(remove.status(), await remove.text()).toBe(200);

    const removedThumbnail = await request.get(
      `${apiBaseURL}/media/public/${original.id}?variant=thumbnail`,
    );
    expect(removedThumbnail.status()).toBe(404);
  });
});
