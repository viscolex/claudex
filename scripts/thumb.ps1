# Windows: the JPEG thumbnails of one picture (images.mjs uses sips on a Mac).
# -Spec is base64 JSON: [{ name, out, max, quality, budget, floor?, shrink? }].
# Each is scaled to fit max px and saved at most budget bytes, the quality
# stepping down to floor; with shrink, the size steps down too until it fits.
# Prints one JSON line: the picture's size and each thumbnail.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Spec
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Json($value) { $value | ConvertTo-Json -Compress -Depth 5 }

function Save-Thumb($img, [string]$out, [int]$max, [int]$quality, [int]$budget, [int]$floor) {
  $scale = [Math]::Min(1.0, $max / [double][Math]::Max($img.Width, $img.Height))
  $tw = [Math]::Max(1, [int][Math]::Round($img.Width * $scale))
  $th = [Math]::Max(1, [int][Math]::Round($img.Height * $scale))
  $bmp = New-Object System.Drawing.Bitmap $tw, $th
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(255, 32, 33, 36))
  $g.DrawImage($img, 0, 0, $tw, $th)
  $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $out) | Out-Null
  $q = $quality
  do {
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]$q)
    $bmp.Save($out, $codec, $params)
    $size = (Get-Item -LiteralPath $out).Length
    $q -= 8
  } while ($size -gt $budget -and $q -ge $floor)
  $bmp.Dispose()
  [ordered]@{ path = $out; width = $tw; height = $th; bytes = $size }
}

try {
  $jobs = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Spec)) | ConvertFrom-Json
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($In)
  try {
    $result = [ordered]@{ ok = $true; width = $img.Width; height = $img.Height }
    foreach ($job in $jobs) {
      $floor = if ($job.floor) { [int]$job.floor } else { 36 }
      $max = [int]$job.max
      do {
        $thumb = Save-Thumb $img $job.out $max ([int]$job.quality) ([int]$job.budget) $floor
        $max = [int]($max * 0.85)
      } while ($job.shrink -and $thumb.bytes -gt [int]$job.budget -and $max -ge 480)
      $result[$job.name] = $thumb
    }
    Write-Json $result
  } finally {
    $img.Dispose()
  }
} catch {
  Write-Json @{ ok = $false; error = "$($_.Exception.Message)" }
}
