param(
  [string]$ApiBaseUrl = "http://localhost:4000/api"
)

$dispatchFlow = Join-Path $PSScriptRoot "test-admin-dispatch-flow.ps1"
& $dispatchFlow -ApiBaseUrl $ApiBaseUrl
