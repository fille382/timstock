# serve.ps1 - liten lokal webbserver for att testa appen pa din dator.
# Kor:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Oppna sedan http://localhost:8080 i webblasaren. Avsluta med Ctrl+C.
#
# Vill du na appen fran mobilen pa samma wifi: kor med -Public och tillat
# porten i brandvaggen (kraver administratorsrattigheter).

param(
    [int]$Port = 8080,
    [switch]$Public
)

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.csv'  = 'text/csv; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
if ($Public) { $listener.Prefixes.Add("http://+:$Port/") }
else { $listener.Prefixes.Add("http://localhost:$Port/") }
$listener.Start()

Write-Host "Fakturering kor pa http://localhost:$Port"
if ($Public) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
    foreach ($ip in $ips) { Write-Host "  fran mobilen: http://$($ip.IPAddress):$Port" }
}
Write-Host "Ctrl+C avslutar."

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
            if ($path -eq '/') { $path = '/index.html' }

            $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
            $full = [System.IO.Path]::GetFullPath($file)

            # Servera aldrig nagot utanfor projektmappen
            if (-not $full.StartsWith($root)) {
                $ctx.Response.StatusCode = 403
                $ctx.Response.Close()
                continue
            }

            if (Test-Path -LiteralPath $full -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($full).ToLower()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($full)
                $ctx.Response.StatusCode = 200
                $ctx.Response.ContentType = $type
                # Close(byte[], bool) satter Content-Length och stanger strommen at oss
                $ctx.Response.Close($bytes, $true)
            }
            else {
                $ctx.Response.StatusCode = 404
                $ctx.Response.ContentType = 'text/plain; charset=utf-8'
                $ctx.Response.Close([System.Text.Encoding]::UTF8.GetBytes('404 Not Found'), $true)
            }
        }
        catch {
            # En trasig forfragan ska inte falla hela servern
            Write-Host "Fel: $($_.Exception.Message)"
            try { $ctx.Response.Abort() } catch { }
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
