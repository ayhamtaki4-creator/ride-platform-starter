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

function Create-Booking($token, $routeId, $travelDate, $name, $phone, $count) {
  return Invoke-RestMethod -Method Post -Uri "$ApiBase/bookings" -Headers (Headers $token) -ContentType "application/json" -Body (@{
    routeId = $routeId
    bookingType = "SHARED_SEAT"
    travelDate = $travelDate
    flightArrivalTime = "11:30"
    flightNumber = "ME 267"
    passengerCount = $count
    luggageCount = 1
    pickupAddress = "Damascus International Airport"
    dropoffAddress = "Damascus city"
    passengerName = $name
    passengerPhone = $phone
    notes = "Operational run automated test"
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

$travelDate = (Get-Date).AddDays((Get-Random -Minimum 40 -Maximum 180)).ToString("yyyy-MM-dd")
$first = Create-Booking $rider.accessToken $route.id $travelDate "Operational Passenger One" "+963944100001" 1
$second = Create-Booking $rider.accessToken $route.id $travelDate "Operational Passenger Two" "+963944100002" 1

foreach ($booking in @($first, $second)) {
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/bookings/$($booking.id)/confirm" -Headers (Headers $admin.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
}

$drivers = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/drivers" -Headers (Headers $admin.accessToken)
$selectedDriver = @($drivers | Where-Object { $_.user.email -eq "driver@example.com" })[0]
if (-not $selectedDriver) { throw "Demo driver was not found." }
$vehicle = @($selectedDriver.vehicles | Where-Object { $_.isActive })[0]
if (-not $vehicle) { throw "Active driver vehicle was not found." }

$run = Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/runs" -Headers (Headers $admin.accessToken) -ContentType "application/json" -Body (@{
  routeId = $route.id
  bookingType = "SHARED_SEAT"
  travelDate = "$($travelDate)T08:00:00.000Z"
  driverId = $selectedDriver.userId
  vehicleId = $vehicle.id
  notes = "Automated operational manifest test"
} | ConvertTo-Json)

Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/runs/$($run.id)/bookings/$($first.id)" -Headers (Headers $admin.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/runs/$($run.id)/bookings/$($second.id)" -Headers (Headers $admin.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/runs/$($run.id)/schedule" -Headers (Headers $admin.accessToken) -ContentType "application/json" -Body "{}" | Out-Null

Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/runs/$($run.id)/accept" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/runs/$($run.id)/boarding" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null

Invoke-RestMethod -Method Patch -Uri "$ApiBase/drivers/me/runs/$($run.id)/bookings/$($first.id)/status" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body (@{ status = "PICKED_UP" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Patch -Uri "$ApiBase/drivers/me/runs/$($run.id)/bookings/$($second.id)/status" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body (@{ status = "NO_SHOW" } | ConvertTo-Json) | Out-Null

Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/runs/$($run.id)/start" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null
Invoke-RestMethod -Method Post -Uri "$ApiBase/drivers/me/runs/$($run.id)/complete" -Headers (Headers $driver.accessToken) -ContentType "application/json" -Body "{}" | Out-Null

$completed = Invoke-RestMethod -Method Get -Uri "$ApiBase/admin/runs/$($run.id)" -Headers (Headers $admin.accessToken)
if ($completed.status -ne "COMPLETED") { throw "Run did not complete." }

$completedBooking = @($completed.bookings | Where-Object { $_.id -eq $first.id })[0]
$noShowBooking = @($completed.bookings | Where-Object { $_.id -eq $second.id })[0]
if ($completedBooking.serviceRunPassengerStatus -ne "DROPPED_OFF") { throw "Picked-up passenger was not completed." }
if ($noShowBooking.serviceRunPassengerStatus -ne "NO_SHOW") { throw "No-show passenger status was not preserved." }

Write-Host "Operational run flow passed: $($completed.runReference)" -ForegroundColor Green
