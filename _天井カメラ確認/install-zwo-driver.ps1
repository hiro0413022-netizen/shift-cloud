$ErrorActionPreference = 'Continue'
$out = Join-Path $PSScriptRoot 'result-driver.txt'
$sb = New-Object System.Text.StringBuilder
function W($t){ [void]$sb.AppendLine("$t") }

W "=== ZWO driver install / $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
W "Administrator: $isAdmin"
W ""

$inf = "C:\Program Files (x86)\ZWO Design\ZWO_USB_Cameras_driver\driver\x64\ASICAMUSB3.inf"
W "--- local inf ---"
if (Test-Path $inf) {
  Get-Item $inf | Select-Object FullName,Length,LastWriteTime | Format-List | Out-String | ForEach-Object { W $_ }
  W "--- inf Version section ---"
  Get-Content $inf -TotalCount 40 | ForEach-Object { W $_ }
} else { W "NOT FOUND: $inf" }

W ""
W "--- before: device state ---"
Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like '*VID_03C3*' } |
  Select-Object Status,Problem,Class,FriendlyName,InstanceId | Format-List | Out-String | ForEach-Object { W $_ }

if ($isAdmin) {
  W "--- pnputil /add-driver /install ---"
  (& pnputil.exe /add-driver "$inf" /install 2>&1) | ForEach-Object { W $_ }
  W "--- pnputil /scan-devices ---"
  (& pnputil.exe /scan-devices 2>&1) | ForEach-Object { W $_ }
  Start-Sleep -Seconds 3
  W "--- after: device state ---"
  Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like '*VID_03C3*' } |
    Select-Object Status,Problem,Class,FriendlyName,InstanceId | Format-List | Out-String | ForEach-Object { W $_ }
} else {
  W "!! Not running as administrator - no changes were made."
}

W ""
W "--- installed ZWO drivers in driver store ---"
(& pnputil.exe /enum-drivers 2>&1) | Out-String | ForEach-Object {
  ($_ -split "`r?`n`r?`n") | Where-Object { $_ -match 'ASICAM|ZWO' } | ForEach-Object { W $_ }
}

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
Write-Host ""
Write-Host "DONE ->" $out
