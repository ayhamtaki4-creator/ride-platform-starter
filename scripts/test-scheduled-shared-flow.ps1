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

function Create-SharedBooking($token, $routeId, $travelDate, $name, $phone, $passengerCount) {
  return Invoke-RestMethod -Method Post -Uri "$ApiBase/bookings" -Headers (Headers $token) -ContentType "application/json" -Body (@{
    routeId = $routeId
    bookingType = "SHARED_SEAT"
    travelDate = $travelDate
    flightArrivalTime = "13:30"
    flightNumber = "ME 265"
    passengerCount = $passengerCount
    luggageCount = 1
    pickupAddress = "Damascus International Airport"
    dropoffAddress = "Damascus city"
    passengerName = $name
    passengerPhone = $phone
    notes = "Shared schedule automated test"
  } | ConvertTo-Json)
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

$travelDate = (Get-Date).AddDays(4).ToString("yyyy-MM-dd")
$first = Create-SharedBooking $rider.accessToken $route.id $travelDate "Shared Passenger One" "+963944000001" 1
$second = Create-SharedBooking $rider.accessToken $route.id $travelDate "Shared Passenger Two" "+963944000002" 2

foreach ($booking in @($first, $second)) {
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/bookings/$($booking.id)/confirm" -Headers (Headers $admin.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
}

$eligible = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/routes/$($route.id)/eligible-drivers?travelDate=$($travelDate)T08:00:00.000Z&passengerCount=3" -Headers $adminHeaders
$selected = @($eligible | Where-Object { $_.driverId -eq $driver.user.id })[0]
if (-not $selected) { throw "Demo driver was not eligible." }
$driverId = $selected.driverId
$vehicleId = @($selected.vehicles)[0].id

$assignedFirst = Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/trips/$($first.id)/assign-driver" -Headers $adminHeaders -ContentType "application/json" -Body (@{ driverId = $driverId; vehicleId = $vehicleId } | ConvertTo-Json)
$assignedSecond = Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/trips/$($second.id)/assign-driver" -Headers $adminHeaders -ContentType "application/json" -Body (@{ driverId = $driverId; vehicleId = $vehicleId } | ConvertTo-Json)

if (-not $assignedFirst.serviceRun -or -not $assignedSecond.serviceRun) {
  throw "Service run was not created."
}

if ($assignedFirst.serviceRun.id -ne $assignedSecond.serviceRun.id) {
  throw "Shared bookings were not grouped in the same service run."
}

if ($assignedSecond.serviceRun.reservedSeats -ne 3) {
  throw "Reserved seat count is incorrect. Expected 3."
}

Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/bookings/$($first.id)/accept" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/bookings/$($second.id)/accept" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null

$schedule = Invoke-RestMethod -Method Get -Uri "$ApiBase/drivers/me/schedule?date=$travelDate" -Headers (Headers $driver.accessToken)
$accepted = @($schedule | Where-Object { $_.driverAssignmentStatus -eq "ACCEPTED" })
if ($accepted.Count -lt 2) {
  throw "Accepted bookings are missing from the driver schedule."
}

Write-Host "Scheduled shared-seat flow passed. Run: $($assignedSecond.serviceRun.runReference)" -ForegroundColor Green
