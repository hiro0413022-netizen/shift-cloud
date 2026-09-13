$ErrorActionPreference = 'Continue'
$out = Join-Path $PSScriptRoot 'result-probe.txt'
$script:lines = New-Object System.Collections.Generic.List[string]
function W($t){
  $s = "$t"
  Write-Host $s
  $script:lines.Add($s)
  [System.IO.File]::WriteAllLines($out, $script:lines, (New-Object System.Text.UTF8Encoding($true)))
}

W "=== WinUSB probe / $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
W ("PSVersion: " + $PSVersionTable.PSVersion.ToString())

try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WU {
  const uint DIGCF_PRESENT = 0x02, DIGCF_DEVICEINTERFACE = 0x10;
  const uint GENERIC_READ = 0x80000000, GENERIC_WRITE = 0x40000000;
  const uint FILE_SHARE_READ = 1, FILE_SHARE_WRITE = 2;
  const uint OPEN_EXISTING = 3, FILE_FLAG_OVERLAPPED = 0x40000000;

  [StructLayout(LayoutKind.Sequential)]
  public struct SP_DEVICE_INTERFACE_DATA { public int cbSize; public Guid g; public int Flags; public IntPtr Reserved; }

  [StructLayout(LayoutKind.Sequential, Pack=1)]
  public struct SETUP { public byte RequestType; public byte Request; public ushort Value; public ushort Index; public ushort Length; }

  [StructLayout(LayoutKind.Sequential)]
  public struct IFDESC { public byte bLength, bDescriptorType, bInterfaceNumber, bAlternateSetting,
                                     bNumEndpoints, bInterfaceClass, bInterfaceSubClass, bInterfaceProtocol, iInterface; }

  [StructLayout(LayoutKind.Sequential)]
  public struct PIPEINFO { public int PipeType; public byte PipeId; public ushort MaximumPacketSize; public byte Interval; }

  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr SetupDiGetClassDevs(ref Guid g, IntPtr e, IntPtr w, uint f);
  [DllImport("setupapi.dll", SetLastError=true)]
  static extern bool SetupDiEnumDeviceInterfaces(IntPtr h, IntPtr d, ref Guid g, uint i, ref SP_DEVICE_INTERFACE_DATA a);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr h, ref SP_DEVICE_INTERFACE_DATA a, IntPtr detail, int size, ref int req, IntPtr dd);
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
  [DllImport("winusb.dll", SetLastError=true)]
  static extern bool WinUsb_QueryInterfaceSettings(IntPtr itf, byte alt, out IFDESC d);
  [DllImport("winusb.dll", SetLastError=true)]
  static extern bool WinUsb_QueryPipe(IntPtr itf, byte alt, byte idx, out PIPEINFO p);

  public static string[] ListPaths(Guid g) {
    var res = new System.Collections.Generic.List<string>();
    IntPtr h = SetupDiGetClassDevs(ref g, IntPtr.Zero, IntPtr.Zero, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (h == (IntPtr)(-1)) return res.ToArray();
    var a = new SP_DEVICE_INTERFACE_DATA();
    a.cbSize = Marshal.SizeOf(typeof(SP_DEVICE_INTERFACE_DATA));
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
      a.cbSize = Marshal.SizeOf(typeof(SP_DEVICE_INTERFACE_DATA));
    }
    SetupDiDestroyDeviceInfoList(h);
    return res.ToArray();
  }

  public static IntPtr devH = IntPtr.Zero, itfH = IntPtr.Zero;

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
    try {
      if (itfH != IntPtr.Zero) { WinUsb_Free(itfH); itfH = IntPtr.Zero; }
      if (devH != IntPtr.Zero && devH != (IntPtr)(-1)) { CloseHandle(devH); devH = IntPtr.Zero; }
    } catch {}
  }

  public static byte[] lastData = new byte[0];

  public static string Desc(byte type, byte index, int len) {
    try {
      byte[] data = new byte[len]; uint x = 0;
      if (!WinUsb_GetDescriptor(itfH, type, index, 0, data, (uint)len, out x))
        { lastData = new byte[0]; return "ERR err=" + Marshal.GetLastWin32Error(); }
      Array.Resize(ref data, (int)x); lastData = data; return "OK";
    } catch (Exception ex) { lastData = new byte[0]; return "EXCEPTION " + ex.Message; }
  }

  public static string Ctrl(byte rt, byte req, ushort val, ushort idx, int len) {
    try {
      byte[] data = new byte[len]; uint x = 0;
      var s = new SETUP(); s.RequestType = rt; s.Request = req; s.Value = val; s.Index = idx; s.Length = (ushort)len;
      if (!WinUsb_ControlTransfer(itfH, s, data, (uint)len, out x, IntPtr.Zero))
        { lastData = new byte[0]; return "ERR err=" + Marshal.GetLastWin32Error(); }
      Array.Resize(ref data, (int)x); lastData = data; return "OK";
    } catch (Exception ex) { lastData = new byte[0]; return "EXCEPTION " + ex.Message; }
  }

  public static string Pipes() {
    try {
      var sb = new StringBuilder();
      IFDESC d;
      if (!WinUsb_QueryInterfaceSettings(itfH, 0, out d)) return "QueryInterfaceSettings ERR err=" + Marshal.GetLastWin32Error();
      sb.Append(string.Format("interface #{0} alt{1} class=0x{2:X2} sub=0x{3:X2} proto=0x{4:X2} endpoints={5}",
        d.bInterfaceNumber, d.bAlternateSetting, d.bInterfaceClass, d.bInterfaceSubClass, d.bInterfaceProtocol, d.bNumEndpoints));
      for (byte i = 0; i < d.bNumEndpoints; i++) {
        PIPEINFO p;
        if (WinUsb_QueryPipe(itfH, 0, i, out p)) {
          string t = p.PipeType == 0 ? "CONTROL" : p.PipeType == 1 ? "ISOCHRONOUS" : p.PipeType == 2 ? "BULK" : "INTERRUPT";
          string dir = (p.PipeId & 0x80) != 0 ? "IN " : "OUT";
          sb.Append(string.Format("\r\n      ep 0x{0:X2} {1} {2,-11} maxPacket={3} interval={4}", p.PipeId, dir, t, p.MaximumPacketSize, p.Interval));
        } else {
          sb.Append(string.Format("\r\n      pipe[{0}] ERR err={1}", i, Marshal.GetLastWin32Error()));
        }
      }
      return sb.ToString();
    } catch (Exception ex) { return "EXCEPTION " + ex.Message; }
  }
}
'@
  W "Add-Type: OK"
} catch {
  W ("Add-Type FAILED: " + $_.Exception.Message)
  exit 1
}

function Hex($b){ if($null -eq $b -or $b.Length -eq 0){ "(empty)" } else { ($b | ForEach-Object { '{0:X2}' -f $_ }) -join ' ' } }

$guids = @([Guid]'A5DCBF10-6530-11D2-901F-00C04FB951ED', [Guid]'88BAE032-5A81-49F0-BC3D-A4FF138216D6')
$paths = New-Object System.Collections.Generic.List[string]
foreach($g in $guids){
  try { foreach($p in [WU]::ListPaths($g)){ if(-not $paths.Contains($p)){ $paths.Add($p) } } }
  catch { W ("ListPaths error: " + $_.Exception.Message) }
}
W ("interfaces found: " + $paths.Count)
foreach($p in $paths){ W ("   " + $p) }

$targets = @()
foreach($p in $paths){ if($p -like '*vid_03c3*'){ $targets += $p } }
W ""
W ("VID_03C3 targets: " + $targets.Count)

foreach($path in $targets){
  W ""
  W "############################################################"
  W ("PATH: " + $path)
  $r = "?"
  try { $r = [WU]::Open($path) } catch { $r = "PS EXCEPTION " + $_.Exception.Message }
  W ("  Open: " + $r)
  if($r -ne "OK"){ try { [WU]::Close() } catch {}; continue }

  $s = [WU]::Desc(1, 0, 18)
  W ("  device descriptor: " + $s)
  if($s -eq "OK"){
    $d = [WU]::lastData
    W ("    raw: " + (Hex $d))
    if($d.Length -ge 18){
      W ("    bcdUSB       = 0x{0:X4}" -f ([int]$d[2] + ([int]$d[3] -shl 8)))
      W ("    bDeviceClass = 0x{0:X2}   bMaxPacketSize0 = {1}" -f $d[4], $d[7])
      W ("    idVendor     = 0x{0:X4}" -f ([int]$d[8] + ([int]$d[9] -shl 8)))
      W ("    idProduct    = 0x{0:X4}   <<<<<<<<" -f ([int]$d[10] + ([int]$d[11] -shl 8)))
      W ("    bcdDevice    = 0x{0:X4}" -f ([int]$d[12] + ([int]$d[13] -shl 8)))
      W ("    iManuf={0} iProd={1} iSerial={2} numConfig={3}" -f $d[14],$d[15],$d[16],$d[17])
    }
  }

  $s = [WU]::Desc(2, 0, 255)
  W ("  config descriptor: " + $s)
  if($s -eq "OK"){ W ("    raw: " + (Hex ([WU]::lastData))) }

  W ("  pipes: " + [WU]::Pipes())

  W "  --- Cypress EZ-USB test: bmReq=0xC0 bReq=0xA0 wValue=0xE600 len=1 (CPUCS) ---"
  $s = [WU]::Ctrl(0xC0, 0xA0, 0xE600, 0, 1)
  if($s -eq "OK"){ W ("    *** OK -> " + (Hex ([WU]::lastData)) + "   <== EZ-USB (FX2/FX3) LIKELY") }
  else { W ("    NG -> " + $s) }

  W "  --- 0xC0 0xA0 wValue=0x0000 len=16 (RAM head) ---"
  $s = [WU]::Ctrl(0xC0, 0xA0, 0x0000, 0, 16)
  W ("    " + $s + "  " + $(if($s -eq 'OK'){ Hex ([WU]::lastData) } else { '' }))

  W "  --- 0xC0 0xA2 len=32 (EEPROM read) ---"
  $s = [WU]::Ctrl(0xC0, 0xA2, 0x0000, 0, 32)
  W ("    " + $s + "  " + $(if($s -eq 'OK'){ Hex ([WU]::lastData) } else { '' }))

  W "  --- other vendor requests ---"
  foreach($req in @(0xA1,0xA5,0xA9,0xB0,0xB1,0xB2,0xD0,0xD1)){
    $s = [WU]::Ctrl(0xC0, [byte]$req, 0, 0, 8)
    W ("    0x{0:X2}: {1}  {2}" -f $req, $s, $(if($s -eq 'OK'){ Hex ([WU]::lastData) } else { '' }))
  }

  try { [WU]::Close() } catch {}
}

W ""
W "DONE"
