$ErrorActionPreference = 'Continue'
$out = Join-Path $PSScriptRoot 'result-fx2.txt'
$script:lines = New-Object System.Collections.Generic.List[string]
function W($t){
  $s = "$t"; Write-Host $s; $script:lines.Add($s)
  [System.IO.File]::WriteAllLines($out, $script:lines, (New-Object System.Text.UTF8Encoding($true)))
}

W "=== FX2 dump / $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class FX {
  const uint DIGCF_PRESENT = 0x02, DIGCF_DEVICEINTERFACE = 0x10;
  const uint GENERIC_READ = 0x80000000, GENERIC_WRITE = 0x40000000;
  const uint FILE_SHARE_READ = 1, FILE_SHARE_WRITE = 2;
  const uint OPEN_EXISTING = 3, FILE_FLAG_OVERLAPPED = 0x40000000;

  [StructLayout(LayoutKind.Sequential)]
  public struct SPDID { public int cbSize; public Guid g; public int Flags; public IntPtr Reserved; }
  [StructLayout(LayoutKind.Sequential, Pack=1)]
  public struct SETUP { public byte RequestType; public byte Request; public ushort Value; public ushort Index; public ushort Length; }

  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr SetupDiGetClassDevs(ref Guid g, IntPtr e, IntPtr w, uint f);
  [DllImport("setupapi.dll", SetLastError=true)]
  static extern bool SetupDiEnumDeviceInterfaces(IntPtr h, IntPtr d, ref Guid g, uint i, ref SPDID a);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr h, ref SPDID a, IntPtr detail, int size, ref int req, IntPtr dd);
  [DllImport("setupapi.dll", SetLastError=true)]
  static extern bool SetupDiDestroyDeviceInfoList(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateFile(string p, uint acc, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr h);
  [DllImport("winusb.dll", SetLastError=true)]
  static extern bool WinUsb_Initialize(IntPtr dev, out IntPtr itf);
  [DllImport("winusb.dll", SetLastError=true)]
  static extern bool WinUsb_Free(IntPtr itf);
  [DllImport("winusb.dll", SetLastError=true)]
  static extern bool WinUsb_ControlTransfer(IntPtr itf, SETUP s, byte[] buf, uint len, out uint xfer, IntPtr ov);
  [DllImport("winusb.dll", SetLastError=true)]
  static extern bool WinUsb_GetDescriptor(IntPtr itf, byte type, byte index, ushort lang, byte[] buf, uint len, out uint xfer);

  public static string[] ListPaths(Guid g) {
    var res = new System.Collections.Generic.List<string>();
    IntPtr h = SetupDiGetClassDevs(ref g, IntPtr.Zero, IntPtr.Zero, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (h == (IntPtr)(-1)) return res.ToArray();
    var a = new SPDID(); a.cbSize = Marshal.SizeOf(typeof(SPDID));
    for (uint i = 0; SetupDiEnumDeviceInterfaces(h, IntPtr.Zero, ref g, i, ref a); i++) {
      int req = 0;
      SetupDiGetDeviceInterfaceDetail(h, ref a, IntPtr.Zero, 0, ref req, IntPtr.Zero);
      if (req > 0) {
        IntPtr buf = Marshal.AllocHGlobal(req);
        Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
        if (SetupDiGetDeviceInterfaceDetail(h, ref a, buf, req, ref req, IntPtr.Zero))
          res.Add(Marshal.PtrToStringUni(new IntPtr(buf.ToInt64() + 4)));
        Marshal.FreeHGlobal(buf);
      }
      a.cbSize = Marshal.SizeOf(typeof(SPDID));
    }
    SetupDiDestroyDeviceInfoList(h);
    return res.ToArray();
  }

  public static IntPtr devH = IntPtr.Zero, itfH = IntPtr.Zero;
  public static byte[] lastData = new byte[0];

  public static string Open(string path) {
    try {
      devH = CreateFile(path, GENERIC_READ|GENERIC_WRITE, FILE_SHARE_READ|FILE_SHARE_WRITE,
                        IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, IntPtr.Zero);
      if (devH == (IntPtr)(-1) || devH == IntPtr.Zero) return "CreateFile FAILED err=" + Marshal.GetLastWin32Error();
      if (!WinUsb_Initialize(devH, out itfH)) return "WinUsb_Initialize FAILED err=" + Marshal.GetLastWin32Error();
      return "OK";
    } catch (Exception ex) { return "EXCEPTION " + ex.Message; }
  }
  public static void Close() {
    try { if (itfH != IntPtr.Zero) { WinUsb_Free(itfH); itfH = IntPtr.Zero; }
          if (devH != IntPtr.Zero && devH != (IntPtr)(-1)) { CloseHandle(devH); devH = IntPtr.Zero; } } catch {}
  }

  public static string Desc(byte type, byte index, ushort lang, int len) {
    try {
      byte[] d = new byte[len]; uint x = 0;
      if (!WinUsb_GetDescriptor(itfH, type, index, lang, d, (uint)len, out x))
        { lastData = new byte[0]; return "ERR err=" + Marshal.GetLastWin32Error(); }
      Array.Resize(ref d, (int)x); lastData = d; return "OK";
    } catch (Exception ex) { lastData = new byte[0]; return "EXCEPTION " + ex.Message; }
  }

  // 0xA0 vendor read of internal RAM
  public static string ReadRam(ushort addr, int len) {
    try {
      byte[] d = new byte[len]; uint x = 0;
      var s = new SETUP(); s.RequestType = 0xC0; s.Request = 0xA0; s.Value = addr; s.Index = 0; s.Length = (ushort)len;
      if (!WinUsb_ControlTransfer(itfH, s, d, (uint)len, out x, IntPtr.Zero))
        { lastData = new byte[0]; return "ERR err=" + Marshal.GetLastWin32Error(); }
      Array.Resize(ref d, (int)x); lastData = d; return "OK";
    } catch (Exception ex) { lastData = new byte[0]; return "EXCEPTION " + ex.Message; }
  }
}
'@
  W "Add-Type: OK"
} catch { W ("Add-Type FAILED: " + $_.Exception.Message); exit 1 }

function Hex($b){ if($null -eq $b -or $b.Length -eq 0){ "(empty)" } else { ($b | ForEach-Object { '{0:X2}' -f $_ }) -join ' ' } }

$paths = [FX]::ListPaths([Guid]'A5DCBF10-6530-11D2-901F-00C04FB951ED') | Where-Object { $_ -like '*vid_03c3*' }
W ("targets: " + @($paths).Count)

foreach($path in @($paths)){
  W ""
  W "############################################################"
  W ("PATH: " + $path)
  $tag = if($path -match 'pid_([0-9a-f]{4})'){ $matches[1].ToUpper() } else { 'unknown' }
  $r = [FX]::Open($path)
  W ("  Open: " + $r)
  if($r -ne "OK"){ [FX]::Close(); continue }

  W "  --- string descriptors ---"
  $s = [FX]::Desc(3, 0, 0, 255)
  W ("    langid table: " + $s + "  " + $(if($s -eq 'OK'){ Hex ([FX]::lastData) } else { '' }))
  $lang = 0x0409
  if($s -eq 'OK' -and [FX]::lastData.Length -ge 4){
    $d = [FX]::lastData
    $lang = [int]$d[2] + ([int]$d[3] -shl 8)
    W ("    using langid = 0x{0:X4}" -f $lang)
  }
  foreach($i in 1..6){
    $s = [FX]::Desc(3, [byte]$i, [uint16]$lang, 255)
    if($s -eq 'OK'){
      $d = [FX]::lastData
      $txt = ''
      if($d.Length -gt 2){ $txt = [System.Text.Encoding]::Unicode.GetString($d, 2, $d.Length - 2) }
      W ("    string[$i] = '" + $txt + "'   (raw " + $d.Length + " bytes)")
    } else {
      W ("    string[$i] : " + $s)
    }
  }

  W "  --- dumping internal RAM 0x0000-0x3FFF via 0xA0 ---"
  $ram = New-Object byte[] 16384
  $ok = 0; $ng = 0
  for($a = 0; $a -lt 16384; $a += 64){
    $s = [FX]::ReadRam([uint16]$a, 64)
    if($s -eq 'OK'){
      $d = [FX]::lastData
      [Array]::Copy($d, 0, $ram, $a, [Math]::Min($d.Length, 64))
      $ok++
    } else { $ng++ }
  }
  W ("    chunks ok=$ok ng=$ng")
  $binPath = Join-Path $PSScriptRoot ("fx2ram_" + $tag + ".bin")
  [System.IO.File]::WriteAllBytes($binPath, $ram)
  W ("    saved -> " + $binPath)

  W "  --- scratch RAM 0xE000-0xE1FF ---"
  $scr = New-Object byte[] 512
  for($a = 0; $a -lt 512; $a += 64){
    $s = [FX]::ReadRam([uint16](0xE000 + $a), 64)
    if($s -eq 'OK'){ $d = [FX]::lastData; [Array]::Copy($d, 0, $scr, $a, [Math]::Min($d.Length,64)) }
  }
  [System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot ("fx2scratch_" + $tag + ".bin")), $scr)
  W ("    saved -> fx2scratch_" + $tag + ".bin")

  W "  --- ASCII strings found in RAM (len>=4) ---"
  $cur = New-Object System.Text.StringBuilder
  $found = 0
  for($i = 0; $i -lt $ram.Length; $i++){
    $c = $ram[$i]
    if($c -ge 0x20 -and $c -lt 0x7F){ [void]$cur.Append([char]$c) }
    else {
      if($cur.Length -ge 4){ W ("    @0x{0:X4} {1}" -f ($i - $cur.Length), $cur.ToString()); $found++ }
      [void]$cur.Clear()
    }
    if($found -gt 200){ break }
  }

  W "  --- search device-descriptor signature in RAM ---"
  for($i = 0; $i -lt $ram.Length - 18; $i++){
    if($ram[$i] -eq 0x12 -and $ram[$i+1] -eq 0x01 -and $ram[$i+8] -eq 0xC3 -and $ram[$i+9] -eq 0x03){
      $seg = New-Object byte[] 18
      [Array]::Copy($ram, $i, $seg, 0, 18)
      W ("    @0x{0:X4}  {1}" -f $i, (Hex $seg))
    }
  }

  [FX]::Close()
}

W ""
W "DONE"
