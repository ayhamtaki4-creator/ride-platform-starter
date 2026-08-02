param(
  [string]$ApiBase = "http://localhost:4000/api"
)

& "$PSScriptRoot\test-fleet-compliance-flow.ps1" -ApiBase $ApiBase
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
