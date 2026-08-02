param(
  [string]$ApiBase = "http://localhost:4000/api"
)

$ErrorActionPreference = "Stop"

function Login($email) {
  return Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/login" -ContentType "application/json" -Body (@{
    email = $email
    password = "ChangeMe123!"
  } | ConvertTo-Json)
}

function Headers($token) {
  return @{ Authorization = "Bearer $token" }
}

$rider = Login "rider@example.com"
$admin = Login "admin@example.com"
$driver = Login "driver@example.com"
$adminHeaders = Headers $admin.accessToken

$route = @((Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/routes" -Headers $adminHeaders) | Where-Object { $_.code -eq "DAM-AIRPORT-DAM" })[0]
if (-not $route) { throw "DAM-AIRPORT-DAM route was not found." }
Invoke-RestMethod -Method Put -Uri "$ApiBase/pricing" -Headers $adminHeaders -ContentType "application/json" -Body (@{
  routeId = $route.id
  bookingType = "SHARED_SEAT"
  passengerPrice = 20
  driverFee = 14
  platformMargin = 6
  currency = "USD"
  isActive = $true
} | ConvertTo-Json) | Out-Null

Invoke-RestMethod -Method Patch -Uri "$ApiBase/drivers/me/availability" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body (@{ availability = "ONLINE" } | ConvertTo-Json) | Out-Null

$travelDate = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
$booking = Invoke-RestMethod -Method Post -Uri "$ApiBase/bookings" -Headers (Headers $rider.accessToken) -ContentType "application/json" -Body (@{
  routeId = $route.id
  bookingType = "SHARED_SEAT"
  travelDate = $travelDate
  flightArrivalTime = "14:30"
  flightNumber = "RB 101"
  passengerCount = 1
  luggageCount = 1
  pickupAddress = "Damascus International Airport"
  dropoffAddress = "Damascus"
  passengerName = "Demo Rider"
  passengerPhone = "+963944000000"
  notes = "Automated booking flow test"
} | ConvertTo-Json)

Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/bookings/$($booking.id)/confirm" -Headers $adminHeaders -ContentType "application/json" -Body "{}" | Out-Null

$eligible = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/routes/$($route.id)/eligible-drivers?travelDate=$($travelDate)T08:00:00.000Z&passengerCount=1" -Headers $adminHeaders
$selected = @($eligible | Where-Object { $_.driverId -eq $driver.user.id })[0]
if (-not $selected) { $selected = @($eligible)[0] }
if (-not $selected) { throw "No eligible driver found." }
$vehicle = @($selected.vehicles)[0]
if (-not $vehicle) { throw "No eligible vehicle found." }

Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/trips/$($booking.id)/assign-driver" -Headers $adminHeaders -ContentType "application/json" -Body (@{
  driverId = $selected.driverId
  vehicleId = $vehicle.id
} | ConvertTo-Json) | Out-Null

Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/bookings/$($booking.id)/accept" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null

$driverTrips = Invoke-RestMethod -Method Get -Uri "$ApiBase/drivers/me/schedule" -Headers (Headers $driver.accessToken)
$assigned = $driverTrips | Where-Object { $_.id -eq $booking.id }
if (-not $assigned) { throw "Assigned booking did not reach the driver." }

Write-Host "Booking flow passed: $($booking.bookingReference)" -ForegroundColor Green
