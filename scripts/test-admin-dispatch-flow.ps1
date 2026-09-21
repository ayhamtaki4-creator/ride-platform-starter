param(
  [string]$ApiBaseUrl = "http://localhost:4000/api"
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
  param(
    [Parameter(Mandatory)] [string]$Method,
    [Parameter(Mandatory)] [string]$Path,
    [string]$Token,
    [object]$Body
  )

  $headers = @{}
  if ($Token) {
    $headers.Authorization = "Bearer $Token"
  }

  $parameters = @{
    Method = $Method
    Uri = "$ApiBaseUrl$Path"
    Headers = $headers
    ContentType = "application/json"
  }

  if ($null -ne $Body) {
    $parameters.Body = $Body | ConvertTo-Json -Depth 10
  }

  Invoke-RestMethod @parameters
}

Write-Host "1/15 Rider login..." -ForegroundColor Cyan
$riderLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "rider@example.com"
  password = "ChangeMe123!"
}

Write-Host "2/15 Driver login..." -ForegroundColor Cyan
$driverLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "driver@example.com"
  password = "ChangeMe123!"
}

Write-Host "3/15 Admin login..." -ForegroundColor Cyan
$adminLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "admin@example.com"
  password = "ChangeMe123!"
}

Write-Host "4/15 Load active route..." -ForegroundColor Cyan
$routes = Invoke-Api -Method Get -Path "/routes"
$route = $routes |
  Where-Object { $_.code -eq "DAM-BEY-AIRPORT" } |
  Select-Object -First 1

if (-not $route) {
  throw "Route DAM-BEY-AIRPORT was not found. Run the API seed first."
}

Write-Host "5/15 Set driver ONLINE..." -ForegroundColor Cyan
Invoke-Api -Method Patch -Path "/drivers/me/availability" `
  -Token $driverLogin.accessToken `
  -Body @{ availability = "ONLINE" } | Out-Null

Write-Host "6/15 Create booking through the canonical booking API..." -ForegroundColor Cyan
$travelDate = (Get-Date).ToUniversalTime().AddDays(45).ToString("yyyy-MM-dd")
$booking = Invoke-Api -Method Post -Path "/bookings" `
  -Token $riderLogin.accessToken `
  -Body @{
    clientRequestId = [guid]::NewGuid().ToString()
    routeId = $route.id
    bookingType = "PRIVATE_CAR"
    vehicleClass = "SMALL"
    travelDate = $travelDate
    flightArrivalTime = "13:30"
    flightNumber = "FLOW-PS1"
    passengerCount = 1
    luggageCount = 1
    pickupAddress = $route.origin.nameAr
    dropoffAddress = $route.destination.nameAr
    passengerName = "اختبار دورة الحجز"
    passengerPhone = "+963944009876"
  }

if ($booking.status -ne "PENDING_DISPATCH") {
  throw "Expected PENDING_DISPATCH, got $($booking.status)."
}

Write-Host "Booking ID: $($booking.id)"
Write-Host "Booking reference: $($booking.bookingReference)"

Write-Host "7/15 Admin confirms booking..." -ForegroundColor Cyan
$confirmed = Invoke-Api -Method Post `
  -Path "/admin/bookings/$($booking.id)/confirm" `
  -Token $adminLogin.accessToken

if ($confirmed.bookingReviewStatus -ne "CONFIRMED") {
  throw "Expected booking review status CONFIRMED, got $($confirmed.bookingReviewStatus)."
}

Write-Host "8/15 Confirm booking in dispatch queue..." -ForegroundColor Cyan
$pendingTrips = Invoke-Api -Method Get -Path "/admin/trips/pending" `
  -Token $adminLogin.accessToken

$pendingTrip = $pendingTrips |
  Where-Object { $_.id -eq $booking.id } |
  Select-Object -First 1

if (-not $pendingTrip) {
  throw "Booking was not found in the admin dispatch queue."
}

Write-Host "9/15 Confirm driver in available list..." -ForegroundColor Cyan
$availableDrivers = Invoke-Api -Method Get -Path "/admin/drivers/available" `
  -Token $adminLogin.accessToken

$availableDriver = $availableDrivers |
  Where-Object { $_.userId -eq $driverLogin.user.id } |
  Select-Object -First 1

if (-not $availableDriver) {
  throw "Driver was not found in the available drivers list."
}

Write-Host "10/15 Admin assigns driver..." -ForegroundColor Cyan
$assigned = Invoke-Api -Method Post `
  -Path "/admin/trips/$($booking.id)/assign-driver" `
  -Token $adminLogin.accessToken `
  -Body @{ driverId = $driverLogin.user.id }

if ($assigned.status -ne "DRIVER_ASSIGNED") {
  throw "Expected DRIVER_ASSIGNED, got $($assigned.status)."
}

Write-Host "11/15 Driver accepts assignment..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/drivers/me/bookings/$($booking.id)/accept" `
  -Token $driverLogin.accessToken `
  -Body @{} | Out-Null

Write-Host "12/15 Driver is arriving..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($booking.id)/arriving" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "13/15 Driver arrived..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($booking.id)/arrived" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "14/15 Start trip..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($booking.id)/start" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "15/15 Complete trip..." -ForegroundColor Cyan
$completed = Invoke-Api -Method Post -Path "/trips/$($booking.id)/complete" `
  -Token $driverLogin.accessToken `
  -Body @{ note = "Automated booking and dispatch test" }

if ($completed.status -ne "COMPLETED") {
  throw "Trip did not reach COMPLETED."
}

Write-Host ""
Write-Host "Booking and dispatch flow completed successfully." -ForegroundColor Green
Write-Host "Final status: $($completed.status)"
Write-Host "Final fare: $($completed.finalFare) $($completed.currency)"
