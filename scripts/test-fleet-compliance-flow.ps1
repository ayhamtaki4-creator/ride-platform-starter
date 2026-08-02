param(
  [string]$ApiBase = "http://localhost:4000/api"
)

$ErrorActionPreference = "Stop"

function Login([string]$email, [string]$password = "ChangeMe123!") {
  return Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/login" -ContentType "application/json" -Body (@{
    email = $email
    password = $password
  } | ConvertTo-Json)
}

function Headers([string]$token) {
  return @{ Authorization = "Bearer $token" }
}

function Upload-Media(
  [string]$token,
  [string]$filePath,
  [string]$purpose,
  [string]$visibility
) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) {
    throw "curl.exe is required for the multipart upload test."
  }

  $json = & curl.exe --silent --show-error --fail-with-body `
    -X POST "$ApiBase/admin/media/upload" `
    -H "Authorization: Bearer $token" `
    -F "purpose=$purpose" `
    -F "visibility=$visibility" `
    -F "file=@$filePath;type=image/png"

  if ($LASTEXITCODE -ne 0) {
    throw "Media upload failed for purpose $purpose."
  }
  return $json | ConvertFrom-Json
}

$admin = Login "admin@example.com"
$rider = Login "rider@example.com"
$adminHeaders = Headers $admin.accessToken
$riderHeaders = Headers $rider.accessToken

$routes = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/routes" -Headers $adminHeaders
$route = @($routes | Where-Object { $_.code -eq "DAM-AMM" })[0]
if (-not $route) { throw "DAM-AMM route was not found." }

Invoke-RestMethod -Method Put -Uri "$ApiBase/pricing" -Headers $adminHeaders -ContentType "application/json" -Body (@{
  routeId = $route.id
  bookingType = "SHARED_SEAT"
  passengerPrice = 35
  driverFee = 25
  platformMargin = 10
  currency = "USD"
  isActive = $true
} | ConvertTo-Json) | Out-Null

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$driverEmail = "compliance-driver-$suffix@example.com"
$driverPassword = "CompliancePass123!"
$plateNumber = "CMP-JO-$suffix"

$createdDriver = Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/drivers" -Headers $adminHeaders -ContentType "application/json" -Body (@{
  firstName = "Compliance"
  lastName = "Driver"
  email = $driverEmail
  phone = "+9639$($suffix.ToString().Substring([Math]::Max(0, $suffix.ToString().Length - 8)))"
  password = $driverPassword
  licenseNumber = "CMP-LIC-$suffix"
  baseRegionCode = "DAMASCUS"
  driverRegionCodes = @("SYRIA", "JORDAN")
  make = "Hyundai"
  model = "H1"
  year = 2024
  color = "White"
  plateNumber = $plateNumber
  seatCapacity = 7
  vehicleBaseRegionCode = "DAMASCUS"
  vehicleRegionCodes = @("SYRIA", "JORDAN")
} | ConvertTo-Json -Depth 6)

$driverId = $createdDriver.id
$vehicleId = @($createdDriver.driverProfile.vehicles)[0].id
if (-not $driverId -or -not $vehicleId) { throw "Driver or vehicle was not created." }

Invoke-RestMethod -Method Patch -Uri "$ApiBase/admin/drivers/$driverId/status" -Headers $adminHeaders -ContentType "application/json" -Body (@{
  status = "APPROVED"
} | ConvertTo-Json) | Out-Null

$driver = Login $driverEmail $driverPassword
Invoke-RestMethod -Method Patch -Uri "$ApiBase/drivers/me/availability" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body (@{
  availability = "ONLINE"
} | ConvertTo-Json) | Out-Null

$travelDate = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
$beforeDocuments = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/routes/$($route.id)/eligible-drivers?travelDate=$($travelDate)T08:00:00.000Z&passengerCount=2" -Headers $adminHeaders
if (@($beforeDocuments | Where-Object { $_.driverId -eq $driverId }).Count -gt 0) {
  throw "Driver was eligible before required Jordan documents were approved."
}

$tempImage = Join-Path $env:TEMP "ride-compliance-$suffix.png"
$pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2ioAAAAASUVORK5CYII="
[System.IO.File]::WriteAllBytes($tempImage, [Convert]::FromBase64String($pngBase64))

try {
  $expiresAt = (Get-Date).AddYears(1).ToUniversalTime().ToString("o")

  $driverPermitMedia = Upload-Media $admin.accessToken $tempImage "DRIVER_DOCUMENT" "PRIVATE"
  $driverPermit = Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/drivers/$driverId/documents" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    documentType = "REGION_ENTRY_PERMIT"
    regionCode = "JORDAN"
    documentNumber = "DRV-JO-$suffix"
    expiresAt = $expiresAt
    mediaAssetId = $driverPermitMedia.id
  } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/drivers/$driverId/documents/$($driverPermit.id)/approve" -Headers $adminHeaders -ContentType "application/json" -Body "{}" | Out-Null

  $vehiclePermitMedia = Upload-Media $admin.accessToken $tempImage "VEHICLE_DOCUMENT" "PRIVATE"
  $vehiclePermit = Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/vehicles/$vehicleId/documents" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    documentType = "REGION_ENTRY_PERMIT"
    regionCode = "JORDAN"
    documentNumber = "VEH-JO-$suffix"
    expiresAt = $expiresAt
    mediaAssetId = $vehiclePermitMedia.id
  } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/vehicles/$vehicleId/documents/$($vehiclePermit.id)/approve" -Headers $adminHeaders -ContentType "application/json" -Body "{}" | Out-Null

  $avatarMedia = Upload-Media $admin.accessToken $tempImage "DRIVER_AVATAR" "PUBLIC"
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/drivers/$driverId/avatar" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    mediaAssetId = $avatarMedia.id
  } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/media/$($avatarMedia.id)/approve" -Headers $adminHeaders -ContentType "application/json" -Body "{}" | Out-Null

  $vehicleImageMedia = Upload-Media $admin.accessToken $tempImage "VEHICLE_IMAGE" "PUBLIC"
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/drivers/$driverId/vehicles/$vehicleId/media-images" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    mediaAssetId = $vehicleImageMedia.id
    isPrimary = $true
    sortOrder = 0
  } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/media/$($vehicleImageMedia.id)/approve" -Headers $adminHeaders -ContentType "application/json" -Body "{}" | Out-Null

  $eligible = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/routes/$($route.id)/eligible-drivers?travelDate=$($travelDate)T08:00:00.000Z&passengerCount=2" -Headers $adminHeaders
  $eligibleDriver = @($eligible | Where-Object { $_.driverId -eq $driverId })[0]
  if (-not $eligibleDriver) { throw "Driver was not eligible after documents were approved." }
  $vehicle = @($eligibleDriver.vehicles | Where-Object { $_.id -eq $vehicleId })[0]
  if (-not $vehicle) { throw "Vehicle was not eligible after documents were approved." }
  if ($eligibleDriver.avatarUrl -notmatch "/api/media/public/") { throw "Approved driver avatar URL was not returned." }
  if ($vehicle.primaryImageUrl -notmatch "/api/media/public/") { throw "Approved primary vehicle image URL was not returned." }

  $booking = Invoke-RestMethod -Method Post -Uri "$ApiBase/bookings" -Headers $riderHeaders -ContentType "application/json" -Body (@{
    routeId = $route.id
    bookingType = "SHARED_SEAT"
    travelDate = $travelDate
    passengerCount = 2
    luggageCount = 2
    pickupAddress = "Damascus"
    dropoffAddress = "Amman"
    passengerName = "Compliance Passenger"
    passengerPhone = "+963944123456"
    notes = "Fleet compliance automated test"
  } | ConvertTo-Json)

  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/bookings/$($booking.id)/confirm" -Headers $adminHeaders -ContentType "application/json" -Body "{}" | Out-Null
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/trips/$($booking.id)/assign-driver" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    driverId = $driverId
    vehicleId = $vehicleId
  } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/bookings/$($booking.id)/accept" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null

  $mine = Invoke-RestMethod -Method Get -Uri "$ApiBase/bookings/me" -Headers $riderHeaders
  $updated = @($mine | Where-Object { $_.id -eq $booking.id })[0]
  if (-not $updated) { throw "Booking was not returned to the passenger." }
  if ($updated.driverPublicProfile.avatarUrl -notmatch "/api/media/public/") { throw "Passenger did not receive the approved driver avatar." }
  if ($updated.driverPublicProfile.vehicle.primaryImageUrl -notmatch "/api/media/public/") { throw "Passenger did not receive the approved vehicle image." }
  if (-not $updated.driverPublicProfile.phone) { throw "Driver phone was not exposed after assignment acceptance." }

  Write-Host "Fleet compliance and media flow passed: $($booking.bookingReference)" -ForegroundColor Green
}
finally {
  Remove-Item $tempImage -Force -ErrorAction SilentlyContinue
}
