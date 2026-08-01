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

Write-Host "1/9 تسجيل دخول الراكب..." -ForegroundColor Cyan
$riderLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "rider@example.com"
  password = "ChangeMe123!"
}

Write-Host "2/9 تسجيل دخول السائق..." -ForegroundColor Cyan
$driverLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = "driver@example.com"
  password = "ChangeMe123!"
}

Write-Host "3/9 جعل السائق Online..." -ForegroundColor Cyan
Invoke-Api -Method Patch -Path "/drivers/me/availability" `
  -Token $driverLogin.accessToken `
  -Body @{ availability = "ONLINE" } | Out-Null

Write-Host "4/9 إنشاء رحلة..." -ForegroundColor Cyan
$trip = Invoke-Api -Method Post -Path "/trips" `
  -Token $riderLogin.accessToken `
  -Body @{
    pickupAddress = "شارع فلسطين، بغداد"
    pickupLatitude = 33.324
    pickupLongitude = 44.421
    dropoffAddress = "المنصور، بغداد"
    dropoffLatitude = 33.315
    dropoffLongitude = 44.350
  }

Write-Host "Trip ID: $($trip.id)"
Write-Host "PIN: $($trip.startPin)"

Write-Host "5/9 قبول السائق للرحلة..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/accept" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "6/9 السائق في الطريق..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/arriving" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "7/9 السائق وصل..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/arrived" `
  -Token $driverLogin.accessToken | Out-Null

Write-Host "8/9 بدء الرحلة بواسطة PIN..." -ForegroundColor Cyan
Invoke-Api -Method Post -Path "/trips/$($trip.id)/start" `
  -Token $driverLogin.accessToken `
  -Body @{ pin = "$($trip.startPin)" } | Out-Null

Write-Host "9/9 إنهاء الرحلة..." -ForegroundColor Cyan
$completed = Invoke-Api -Method Post -Path "/trips/$($trip.id)/complete" `
  -Token $driverLogin.accessToken `
  -Body @{ note = "Automated milestone test" }

if ($completed.status -ne "COMPLETED") {
  throw "الرحلة لم تصل إلى حالة COMPLETED."
}

Write-Host ""
Write-Host "نجح اختبار دورة الرحلة بالكامل." -ForegroundColor Green
Write-Host "الحالة النهائية: $($completed.status)"
Write-Host "الأجرة النهائية: $($completed.finalFare) $($completed.currency)"
