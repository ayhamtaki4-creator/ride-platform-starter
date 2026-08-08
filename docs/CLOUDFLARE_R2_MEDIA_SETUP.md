# Cloudflare R2 media storage

The application can store uploaded media in Cloudflare R2 instead of the Render local filesystem.
The bucket does **not** need to be public. Public driver/vehicle images are still served through the API's existing `/api/media/public/:id` route, while private documents remain protected by authenticated API routes.

## 1. Create the bucket

In Cloudflare Dashboard:

1. Open **R2 Object Storage**.
2. Create a bucket, for example `ride-platform-media`.
3. Keep the bucket private.

## 2. Create R2 API credentials

Create an R2 API token with **Object Read & Write** access to this bucket.
Copy:

- Account ID
- Access Key ID
- Secret Access Key

Do not commit these secrets to GitHub.

## 3. Add Render environment variables

On the API service in Render add:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=ride-platform-media
R2_KEY_PREFIX=ride-platform/media
PUBLIC_API_URL=https://ride-platform-starter.onrender.com
```

`R2_KEY_PREFIX` is optional. `PUBLIC_API_URL` is recommended even though the API also falls back to Render's `RENDER_EXTERNAL_URL`.

## 4. Deploy

After adding the variables, redeploy the API. New uploads will be written to R2 automatically.

The `MediaAsset.storagePath` column will contain values such as:

```text
r2://ride-platform-media/ride-platform/media/<uuid>.jpg
```

If R2 variables are absent, local storage remains available for development only.

## 5. Existing images

Files that were uploaded to Render's ephemeral local filesystem may no longer exist after a restart/deploy. If an old image returns 404, re-upload it once after R2 is enabled. From that point onward it is stored centrally and all devices use the same API URL.

## 6. Image processing

For `DRIVER_AVATAR` and `VEHICLE_IMAGE` uploads the portal processes the image before upload:

- keeps the original pixel dimensions;
- applies the admin-selected logo watermark;
- for vehicle images, runs Tesseract.js OCR in the browser and blurs detected plate-number text;
- PNG remains lossless; JPEG/WebP is exported at high quality (0.96).

The admin controls the logo, watermark opacity/size, and plate-blur switch from **Administration → Image protection & logo**.
