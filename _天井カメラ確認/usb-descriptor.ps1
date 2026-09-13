$ErrorActionPreference = 'SilentlyContinue'
$out = Join-Path $PSScriptRoot 'result-usb.txt'
$sb = New-Object System.Text.StringBuilder
function W($t){ [void]$sb.AppendLine("$t") }

W "=== USB descriptor of VID_03C3 devices / $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

$devs = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like '*VID_03C3*' }
if(-not $devs){ W "no VID_03C3 device found (is the camera plugged in?)" }

foreach($d in $devs){
  W ""
  W "##################################################"
  W ("InstanceId : " + $d.InstanceId)
  W ("Status     : " + $d.Status + "   Problem: " + $d.Problem)
  $props = Get-PnpDeviceProperty -InstanceId $d.InstanceId -ErrorAction SilentlyContinue
  foreach($k in @(
    'DEVPKEY_Device_BusReportedDeviceDesc',
    'DEVPKEY_Device_DeviceDesc',
    'DEVPKEY_Device_HardwareIds',
    'DEVPKEY_Device_CompatibleIds',
    'DEVPKEY_Device_Manufacturer',
    'DEVPKEY_Device_LocationInfo',
    'DEVPKEY_Device_Driver',
    'DEVPKEY_Device_InstallState',
    'DEVPKEY_Device_ProblemCode',
    'DEVPKEY_Device_ContainerId')){
    $p = $props | Where-Object { $_.KeyName -eq $k }
    if($p){ W ("  " + $k.Replace('DEVPKEY_Device_','') + " = " + ($p.Data -join ' | ')) }
  }
  W "  --- all properties ---"
  $props | Sort-Object KeyName | ForEach-Object {
    $v = $_.Data
    if($v -is [array]){ $v = ($v -join ' | ') }
    W ("    " + $_.KeyName + " = " + $v)
  }
}

W ""
W "### USB hub port info (Win32_PnPEntity)"
Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
  Where-Object { $_.PNPDeviceID -like '*VID_03C3*' } |
  Select-Object Name,Description,Manufacturer,Service,Status,ConfigManagerErrorCode,PNPDeviceID |
  Format-List | Out-String -Width 250 | ForEach-Object { W $_ }

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
Write-Host "DONE ->" $out
