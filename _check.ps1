$p = 'd:\company projects\New folder\shopify\evoskin\assets\section-featured-collection-showcase.css'
$t = [System.IO.File]::ReadAllText($p)

# Show every .fcs-hero-col rule in document order with its media context
$blocks = [regex]::Matches($t, '(?s)(@media[^{]*\{)?[^{}]*\.fcs-hero-col\s*\{([^}]*)\}')
$lines = $t -split "`n"
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '\.fcs-hero-col\s*\{') {
        # find nearest preceding @media
        $ctx = 'BASE'
        for ($j = $i; $j -ge 0; $j--) {
            if ($lines[$j] -match '@media([^{]*)\{') { $ctx = $Matches[1].Trim(); break }
        }
        $body = ''
        for ($k = $i + 1; $k -lt [Math]::Min($i + 9, $lines.Count); $k++) {
            if ($lines[$k] -match '^\s*\}') { break }
            $body += $lines[$k].Trim() + ' '
        }
        Write-Output ("[{0}]  {1}" -f $ctx, $body.Trim())
    }
}
