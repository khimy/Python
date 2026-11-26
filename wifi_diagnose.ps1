# wifi_diagnose.ps1 - Read-only Wi-Fi diagnostics for Windows.
# Changes NO settings. Saves a report to the Desktop: wifi_report.txt
$ErrorActionPreference = 'SilentlyContinue'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'wifi_report.txt'
function Section($t) { "`n===== $t =====" }

& {
  Section '1) System / adapter / network'
  (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version | Format-List | Out-String).Trim()
  netsh wlan show interfaces
  Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } |
    Select-Object InterfaceAlias, @{n='IPv4';e={$_.IPv4Address.IPAddress}},
                  @{n='Gateway';e={$_.IPv4DefaultGateway.NextHop}},
                  @{n='DNS';e={$_.DNSServer.ServerAddresses -join ', '}} | Format-List
  Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name, InterfaceDescription, LinkSpeed | Format-Table -AutoSize

  Section '2) Ping (router vs internet)'
  $gw = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4DefaultGateway.NextHop
  "Gateway: $gw"
  ping -n 20 $gw
  ping -n 20 8.8.8.8
  ping -n 10 google.com

  Section '2b) Speed test (Cloudflare)'
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-WebRequest -UseBasicParsing 'https://speed.cloudflare.com/__down?bytes=50000000'
    $sw.Stop()
    'Download: {0:N1} Mbps' -f (($r.RawContentLength * 8 / 1e6) / $sw.Elapsed.TotalSeconds)
  } catch { "Download test failed: $_" }
  try {
    $body = New-Object byte[] 15000000
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-WebRequest -UseBasicParsing -Method Post -Body $body 'https://speed.cloudflare.com/__up' | Out-Null
    $sw.Stop()
    'Upload:   {0:N1} Mbps' -f (($body.Length * 8 / 1e6) / $sw.Elapsed.TotalSeconds)
  } catch { "Upload test failed: $_" }

  Section '3) Apps using the network now (by open connections)'
  Get-NetTCPConnection -State Established |
    Group-Object OwningProcess | Sort-Object Count -Descending | Select-Object -First 15 |
    ForEach-Object { '{0,-35} {1,4} connections' -f (Get-Process -Id $_.Name).ProcessName, $_.Count }

  Section '4) Nearby Wi-Fi networks'
  netsh wlan show networks mode=bssid
  "--- Networks per channel ---"
  netsh wlan show networks mode=bssid | Select-String 'Channel\s*:\s*(\d+)' |
    ForEach-Object { $_.Matches[0].Groups[1].Value } | Group-Object |
    Sort-Object { [int]$_.Name } | ForEach-Object { 'Channel {0,-4}: {1} network(s)' -f $_.Name, $_.Count }

  Section '5) Devices on the network'
  if ($gw) {
    $base = ($gw -split '\.')[0..2] -join '.'
    $tasks = 1..254 | ForEach-Object { (New-Object Net.NetworkInformation.Ping).SendPingAsync("$base.$_", 300) }
    [Threading.Tasks.Task]::WaitAll($tasks) 2>$null
  }
  Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -in 'Reachable','Stale','Delay','Probe' -and $_.LinkLayerAddress -notmatch '^(00-00-00|FF-FF-FF|01-00-5E)' } |
    Sort-Object { [version]$_.IPAddress } | ForEach-Object {
      $name = try { [Net.Dns]::GetHostEntry($_.IPAddress).HostName } catch { '' }
      '{0,-16} {1,-18} {2}' -f $_.IPAddress, $_.LinkLayerAddress, $name
    }
} *>&1 | Tee-Object -FilePath $out

"`nReport saved to: $out"
