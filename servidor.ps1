$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8123
$url = "http://127.0.0.1:$port/"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)

try {
    $listener.Start()
} catch {
    Write-Host "No se pudo abrir el puerto $port. Comprueba si ya hay un servidor en marcha." -ForegroundColor Red
    exit 1
}

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

Write-Host ""
Write-Host "  ULTIMA NOCHE" -ForegroundColor Red
Write-Host "  Servidor local: $url" -ForegroundColor Green
Write-Host "  Pulsa Ctrl+C para detenerlo." -ForegroundColor DarkGray
Write-Host ""

Start-Process $url

while ($true) {
    $client = $listener.AcceptTcpClient()

    try {
        $stream = $client.GetStream()
        $reader = [System.IO.StreamReader]::new(
            $stream,
            [System.Text.Encoding]::ASCII,
            $false,
            1024,
            $true
        )

        $requestLine = $reader.ReadLine()
        if (-not $requestLine) {
            continue
        }

        while (($line = $reader.ReadLine()) -ne '') {
            if ($null -eq $line) { break }
        }

        $parts = $requestLine.Split(' ')
        $urlPath = [Uri]::UnescapeDataString($parts[1].Split('?')[0])
        if ($urlPath -eq '/') {
            $urlPath = '/index.html'
        }

        $relative = $urlPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

        if (-not $filePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes('403 Forbidden')
            $header = "HTTP/1.1 403 Forbidden`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $stream.Write([System.Text.Encoding]::ASCII.GetBytes($header), 0, $header.Length)
            $stream.Write($body, 0, $body.Length)
            continue
        }

        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $stream.Write([System.Text.Encoding]::ASCII.GetBytes($header), 0, $header.Length)
            $stream.Write($body, 0, $body.Length)
            continue
        }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $contentType = if ($mime.ContainsKey($extension)) {
            $mime[$extension]
        } else {
            'application/octet-stream'
        }

        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush()
    } catch {
        # Ignora conexiones canceladas por el navegador.
    } finally {
        try { $client.Close() } catch {}
    }
}
