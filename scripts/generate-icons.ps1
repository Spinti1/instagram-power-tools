Add-Type -AssemblyName System.Drawing

function Create-ExtensionIcon([int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(1.0, $size * 0.05)
    $w = $size - (2.0 * $pad)
    $h = $size - (2.0 * $pad)
    $radius = [Math]::Max(2.0, $size * 0.24)

    # 1. Base squircle path
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2.0
    $path.AddArc($pad, $pad, $d, $d, 180, 90)
    $path.AddArc($pad + $w - $d, $pad, $d, $d, 270, 90)
    $path.AddArc($pad + $w - $d, $pad + $h - $d, $d, $d, 0, 90)
    $path.AddArc($pad, $pad + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    # Fill Obsidian Dark Base
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 14, 14, 18))
    $g.FillPath($bgBrush, $path)

    # Subtle Obsidian Rim
    $rimPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 255, 255, 255), [Math]::Max(1.0, $size * 0.03))
    $g.DrawPath($rimPen, $path)

    # 2. Instagram Neon Gradient Brush
    $cTop = [System.Drawing.Color]::FromArgb(255, 244, 63, 94)   # Rose/Orange
    $cBot = [System.Drawing.Color]::FromArgb(255, 139, 92, 246)  # Violet
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($size, $size)),
        $cTop,
        $cBot
    )

    # Outer Camera Squircle Outline
    $camPad = $size * 0.20
    $camW = $size - (2.0 * $camPad)
    $camH = $size - (2.0 * $camPad)
    $camRadius = [Math]::Max(2.0, $size * 0.18)
    $camD = $camRadius * 2.0

    $camPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $camPath.AddArc($camPad, $camPad, $camD, $camD, 180, 90)
    $camPath.AddArc($camPad + $camW - $camD, $camPad, $camD, $camD, 270, 90)
    $camPath.AddArc($camPad + $camW - $camD, $camPad + $camH - $camD, $camD, $camD, 0, 90)
    $camPath.AddArc($camPad, $camPad + $camH - $camD, $camD, $camD, 90, 90)
    $camPath.CloseFigure()

    $strokeW = [Math]::Max(1.5, $size * 0.075)
    $camPen = New-Object System.Drawing.Pen($gradBrush, $strokeW)
    $g.DrawPath($camPen, $camPath)

    # Center Lens Circle
    $lensR = $size * 0.18
    $cx = $size / 2.0
    $cy = $size / 2.0
    $lensPen = New-Object System.Drawing.Pen($gradBrush, $strokeW)
    $g.DrawEllipse($lensPen, [float]($cx - $lensR), [float]($cy - $lensR), [float]($lensR * 2.0), [float]($lensR * 2.0))

    # Flash Dot (top-right of camera)
    $dotR = [Math]::Max(1.0, $size * 0.045)
    $dotX = $camPad + $camW - ($size * 0.13)
    $dotY = $camPad + ($size * 0.13)
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 63, 94))
    $g.FillEllipse($dotBrush, [float]($dotX - $dotR), [float]($dotY - $dotR), [float]($dotR * 2.0), [float]($dotR * 2.0))

    if ($size -ge 32) {
        # White center specular flash
        $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $specR = [Math]::Max(0.8, $dotR * 0.5)
        $g.FillEllipse($whiteBrush, [float]($dotX - $specR), [float]($dotY - $specR), [float]($specR * 2.0), [float]($specR * 2.0))
        $whiteBrush.Dispose()
    }

    # Clean up GDI objects
    $bgBrush.Dispose()
    $rimPen.Dispose()
    $gradBrush.Dispose()
    $camPen.Dispose()
    $lensPen.Dispose()
    $dotBrush.Dispose()
    $path.Dispose()
    $camPath.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Generated: $outPath ($size x $size)"
}

$destDir = "d:\Test\ig-tools\icons"
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }

Create-ExtensionIcon 16 (Join-Path $destDir "icon-16.png")
Create-ExtensionIcon 32 (Join-Path $destDir "icon-32.png")
Create-ExtensionIcon 48 (Join-Path $destDir "icon-48.png")
Create-ExtensionIcon 128 (Join-Path $destDir "icon-128.png")
