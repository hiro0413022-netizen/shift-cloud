$ErrorActionPreference = 'SilentlyContinue'
$out = Join-Path $PSScriptRoot 'result-inf.txt'
$sb = New-Object System.Text.StringBuilder
function W($t){ [void]$sb.AppendLine("$t") }

W "=== inf / setupapi check $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

$infs = @()
$infs += "C:\Program Files (x86)\ZWO Design\ZWO_USB_Cameras_driver\driver\x64\ASICAMUSB3.inf"
$oem = Get-ChildItem "C:\Windows\INF\oem*.inf" -ErrorAction SilentlyContinue |
       Where-Object { (Select-String -Path $_.FullName -Pattern 'VID_03C3' -Quiet) }
foreach($o in $oem){ $infs += $o.FullName }

foreach($inf in ($infs | Select-Object -Unique)) {
  W ""
  W "########## $inf"
  if(-not (Test-Path $inf)){ W "  (not found)"; continue }
  $pids = Select-String -Path $inf -Pattern 'PID_([0-9A-Fa-f]{4})' -AllMatches |
          ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value.ToUpper() } |
          Sort-Object -Unique
  W ("  supported PIDs (" + $pids.Count + "): " + ($pids -join ', '))
  foreach($target in @('034A','034B','034C')){
    W ("  contains PID_" + $target + " : " + $(if($pids -contains $target){'YES'}else{'NO'}))
  }
}

W ""
W "### all ZWO-related oem*.inf in C:\Windows\INF"
$oem | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { W $_ }

W ""
W "### other inf files shipped by ImpactVision / anywhere with 03C3 (quick scan of common spots)"
foreach($root in @('C:\ImpactVision2','C:\ImpactVision','C:\GolfPlus','D:\','E:\')){
  if(Test-Path $root){
    Get-ChildItem -Path $root -Recurse -Filter *.inf -ErrorAction SilentlyContinue |
      Select-Object -First 200 | ForEach-Object {
        if(Select-String -Path $_.FullName -Pattern 'VID_03C3' -Quiet){ W ("  HIT: " + $_.FullName) }
      }
  }
}

W ""
W "### setupapi.dev.log — lines around VID_03C3 (last 200 hits)"
$log = 'C:\Windows\INF\setupapi.dev.log'
if(Test-Path $log){
  $lines = Get-Content $log -ErrorAction SilentlyContinue
  for($i=0; $i -lt $lines.Count; $i++){
    if($lines[$i] -match '03C3|03c3'){
      $s = [Math]::Max(0,$i-6); $e = [Math]::Min($lines.Count-1,$i+14)
      W ("--- line $i ---")
      $lines[$s..$e] | ForEach-Object { W $_ }
      $i = $e
    }
  }
} else { W "  setupapi.dev.log not found" }

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
Write-Host "DONE ->" $out
