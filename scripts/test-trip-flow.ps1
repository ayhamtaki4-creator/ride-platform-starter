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

Write-Host "1/12 Rider login..." -ForegroundColor Cyan
$riderLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "rider@example.com"
  password = "ChangeMe123!"
}

Write-Host "2/12 Driver login..." -ForegroundColor Cyan
$driverLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "driver@example.com"
  password = "ChangeMe123!"
}

Write-Host "3/12 Admin login..." -ForegroundColor Cyan
$adminLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "admin@example.com"
  password = "ChangeMe123!"
}

Write-Host "4/12 Set driver ONLINE..." -ForegroundColor Cyan
Invoke-Api -Method Patch -Path "/drivers/me/availability" `
  -Token $driverLogin.accessToken `
  -Body @{ availability = "ONLINE" } | Out-Null

Write-Host "5/12 Create rider request..." -ForegroundColor Cyan
$trip = Invoke-Api -Method Post -Path "/trips" `
  -Token $riderLogin.accessToken `
  -Body @{
    pickupAddress = "Palestine Street, Baghdad"
    pickupLatitude = 33.324
    pickupLongitude = 44.421
    dropoffAddress = "Mansour, Baghdad"
    dropoffLatitude = 33.315
    dropoffLongitude = 44.350
  }

if ($trip.status -ne "PENDING_DISPATCH") {
  throw "Expected PENDING_DISPATCH, got $($trip.status)."
}

Write-Host "Trip ID: $($trip.id)"

Write-Host "6/12 Confirm request in admin queue..." -ForegroundColor Cyan
$pendingTrips = Invoke-Api -Method Get -Path "/admin/trips/pending" `
  -Token $adminLogin.accessToken

$pendingTrip = $pendingTrips |
  Where-Object { $_.id -eq $trip.id } |
  Select-Object -First 1

if (-not $pendingTrip) {
  throw "Trip was not found in the admin dispatch queue."
}

Write-Host "7/12 Confirm driver in available list..." -ForegroundColor Cyan
$availableDrivers = Invoke-Api -Method Get -Path "/admin/drivers/available" `
  -Token $adminLogin.accessToken

$availableDriver = $availableDrivers |
  Where-Object { $_.userId -eq $driverLogin.user.id } |
  Select-Object -First 1

if (-not $availableDriver) {
  throw "Driver was not found in the available drivers list."
}

Write-Host "8/12 Admin assigns driver..." -ForegroundColor Cyan
$assigned = Invoke-Api -Method Post `
  -Path "/admin/trips/$($trip.id)/assign-driver" `
  -Token $adminLogin.accessToken `
  -Body @{ driverId = $driverLogin.user.id }

if ($assigned.status -ne "DRIVER_ASSIGNED") {
  throw "Expected DRIVER_ASSIGNED, got $($assigned.status)."
}

Write-Host "Driver accepts assignment..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/drivers/me/bookings/$($trip.id)/accept" `
  -Token $driverLogin.accessToken `
  -Body @{} | Out-Null

Write-Host "9/12 Driver is arriving..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/arriving" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "10/12 Driver arrived..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/arrived" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "11/12 Start trip..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/start" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "12/12 Complete trip..." -ForegroundColor Cyan
$completed = Invoke-Api -Method Post -Path "/trips/$($trip.id)/complete" `
  -Token $driverLogin.accessToken `
  -Body @{ note = "Automated admin dispatch test" }

if ($completed.status -ne "COMPLETED") {
  throw "Trip did not reach COMPLETED."
}

Write-Host ""
Write-Host "Admin dispatch flow completed successfully." -ForegroundColor Green
Write-Host "Final status: $($completed.status)"
Write-Host "Final fare: $($completed.finalFare) $($completed.currency)"
