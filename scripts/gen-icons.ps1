# EasyBitT 图标生成：圆角方块 + 白色下载箭头
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # 圆角方块背景
  $r = [Math]::Max(2.0, $size * 0.22)
  $d = $r * 2.0
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddArc(0, 0, $d, $d, 180, 90)
  $gp.AddArc($size - $d, 0, $d, $d, 270, 90)
  $gp.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $gp.AddArc(0, $size - $d, $d, $d, 90, 90)
  $gp.CloseFigure()
  $blue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
  $g.FillPath($blue, $gp)

  # 白色向下箭头（矩形杆 + 三角头）
  $white = [System.Drawing.Brushes]::White
  $shaftW = [Math]::Max(2.0, $size * 0.16)
  $shaftX = ($size - $shaftW) / 2
  $shaftTop = $size * 0.20
  $shaftH = $size * 0.30
  $g.FillRectangle($white, [float]$shaftX, [float]$shaftTop, [float]$shaftW, [float]$shaftH)

  $headW = $size * 0.54
  $headH = $size * 0.28
  $headTop = $shaftTop + $shaftH
  $p1 = New-Object System.Drawing.PointF((($size - $headW) / 2), $headTop)
  $p2 = New-Object System.Drawing.PointF((($size + $headW) / 2), $headTop)
  $p3 = New-Object System.Drawing.PointF(($size / 2), ($headTop + $headH))
  $g.FillPolygon($white, @($p1, $p2, $p3))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "OK $path ($size x $size)"
}

New-Icon 16  (Join-Path $outDir "icon16.png")
New-Icon 32  (Join-Path $outDir "icon32.png")
New-Icon 48  (Join-Path $outDir "icon48.png")
New-Icon 128 (Join-Path $outDir "icon128.png")
