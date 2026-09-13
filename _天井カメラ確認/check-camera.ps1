$ErrorActionPreference = 'SilentlyContinue'
$out = Join-Path $PSScriptRoot 'result.txt'
$sb = New-Object System.Text.StringBuilder

function W($t){ [void]$sb.AppendLine($t) }

W "=== collected: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
W ""
W "### [1] Camera / Image / Media class devices"
Get-PnpDevice -Class Camera,Image,Media -ErrorAction SilentlyContinue |
  Select-Object Status,Class,FriendlyName,InstanceId |
  Format-Table -AutoSize | Out-String -Width 300 | ForEach-Object { W $_ }

W "### [2] Devices with a problem (unknown / driver missing)"
Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.Status -ne 'OK' } |
  Select-Object Status,Class,FriendlyName,InstanceId,Problem |
  Format-Table -AutoSize | Out-String -Width 300 | ForEach-Object { W $_ }

W "### [3] All USB devices (VID/PID)"
Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -like 'USB\*' } |
  Select-Object Status,Class,FriendlyName,InstanceId |
  Sort-Object Class,FriendlyName |
  Format-Table -AutoSize | Out-String -Width 300 | ForEach-Object { W $_ }

W "### [4] Driver info for camera-ish devices"
Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue |
  Where-Object { $_.DeviceClass -in @('CAMERA','IMAGE','MEDIA','USB') } |
  Select-Object DeviceName,DeviceClass,DriverProviderName,DriverVersion,DriverDate,InfName |
  Format-Table -AutoSize | Out-String -Width 300 | ForEach-Object { W $_ }

W "### [5] ZWO / ASI related files on this PC (quick scan)"
$paths = @("$env:ProgramFiles","${env:ProgramFiles(x86)}","$env:LOCALAPPDATA")
foreach($p in $paths){
  Get-ChildItem -Path $p -Recurse -Depth 3 -Include 'ASICamera2.dll','IVCAM1.dll','*ZWO*','*ASI*' -ErrorAction SilentlyContinue |
    Select-Object -First 40 -ExpandProperty FullName | ForEach-Object { W $_ }
}

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
Write-Host ""
Write-Host "DONE ->" $out
Write-Host ""
