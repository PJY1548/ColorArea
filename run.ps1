# run.ps1
Write-Host "正在安装依赖" -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "npm install; Read-Host 'Wrangler 安装完成，按任意键继续...'" -Wait
$choice = Read-Host "是否要进行下一步登录 Cloudflare? (Y/N)"
if ($choice -eq 'N' -or $choice -eq 'n') { exit }

Write-Host "正在登录 Cloudflare..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "npx wrangler@latest login; Read-Host '登录成功，按任意键继续...'" -Wait

$choice = Read-Host "是否要创建或更新 wrangler.toml 配置文件? (Y/N)"
if ($choice -eq 'N' -or $choice -eq 'n') { exit }

Write-Host "正在创建或更新 wrangler.toml 配置文件..." -ForegroundColor Green
if (!(Test-Path wrangler.toml)) {
    @"
name = "color-area"
main = "worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

"@ | Out-File -FilePath wrangler.toml -Encoding utf8
    Write-Host "配置文件已创建" -ForegroundColor Yellow
} else {
    Write-Host "配置文件已存在" -ForegroundColor Yellow
}

$choice = Read-Host "是否要创建 KV 命名空间? (Y/N)"
if ($choice -eq 'N' -or $choice -eq 'n') { exit }

Write-Host "正在创建 KV 命名空间..." -ForegroundColor Green
# 执行命令并将输出保存到临时文件
$tempFile = "temp_output.txt"
npx wrangler@latest kv namespace create "PUBLIC_ASSETS" --preview false > $tempFile 2>&1

# 从临时文件中读取输出
$output = Get-Content $tempFile -Raw
Remove-Item $tempFile

Write-Host "命令输出" -ForegroundColor Cyan
$output | Write-Host

# 从输出中提取ID，匹配32位十六进制字符串
$idPattern = '[0-9a-fA-F]{32}'
$matches = [regex]::Matches($output, $idPattern)

if ($matches.Count -gt 0) {
    $KV_ID = $matches[0].Value
    Write-Host "KV命名空间ID: $KV_ID" -ForegroundColor Yellow
} else {
    Write-Warning "未能从输出中获取KV命名空间ID"
    $KV_ID = Read-Host "请手动输入KV命名空间ID"
}

if ([string]::IsNullOrEmpty($KV_ID)) {
    Write-Error "错误：未能获取有效的KV命名空间ID"
    Read-Host "按任意键退出..."
    exit 1
}

$choice = Read-Host "是否要创建 D1 数据库? (Y/N)"
if ($choice -eq 'N' -or $choice -eq 'n') { exit }

Write-Host "正在创建 D1 数据库..." -ForegroundColor Green
# 创建D1数据库并获取名称和ID
$d1Output = npx wrangler@latest d1 create color-db 2>&1

Write-Host "D1数据库创建输出" -ForegroundColor Cyan
$d1Output | ForEach-Object { Write-Host $_ }

# 从输出中提取数据库ID（32位十六进制字符串）
$dbIdPattern = '[0-9a-fA-F]{32}'
$dbMatches = [regex]::Matches(($d1Output | Out-String), $dbIdPattern)

if ($dbMatches.Count -gt 0) {
    $DB_ID = $dbMatches[0].Value
    Write-Host "D1数据库ID: $DB_ID" -ForegroundColor Yellow
} else {
    Write-Warning "未能从输出中获取D1数据库ID"
    $DB_ID = Read-Host "请手动输入D1数据库ID"
}

if ([string]::IsNullOrEmpty($DB_ID)) {
    Write-Error "错误：未能获取有效的D1数据库ID"
    Read-Host "按任意键退出..."
    exit 1
}

Write-Host "正在更新 wrangler.toml 文件以添加数据库和KV绑定..." -ForegroundColor Green

# 读取现有的wrangler.toml内容并追加数据库和KV配置
$wranglerConfig = Get-Content wrangler.toml -Raw

# 检查是否已经包含数据库配置
if ($wranglerConfig -notmatch '\[\[d1_databases\]\]') {
    # 添加D1数据库配置
    $d1Config = @"
[[d1_databases]]
binding = "DB"
database_name = "color-db"
database_id = "$DB_ID"

"@
    Add-Content -Path wrangler.toml -Value $d1Config
    Write-Host "D1数据库配置已添加到 wrangler.toml" -ForegroundColor Yellow
} else {
    # 更新现有的数据库ID
    $updatedConfig = $wranglerConfig -replace 'database_id = ".*"', "database_id = `"$DB_ID`""
    Set-Content -Path wrangler.toml -Value $updatedConfig
    Write-Host "D1数据库ID已更新" -ForegroundColor Yellow
}

# 检查是否已经包含KV配置
if ($wranglerConfig -notmatch '\[\[kv_namespaces\]\]') {
    # 添加KV命名空间配置
    $kvConfig = @"
[[kv_namespaces]]
binding = "PUBLIC_ASSETS"
id = "$KV_ID"
preview_id = "$KV_ID"

"@
    Add-Content -Path wrangler.toml -Value $kvConfig
    Write-Host "KV命名空间配置已添加到 wrangler.toml" -ForegroundColor Yellow
} else {
    # 更新现有的KV ID
    $updatedConfig = $wranglerConfig -replace 'id = ".*"', "id = `"$KV_ID`""
    $updatedConfig = $updatedConfig -replace 'preview_id = ".*"', "preview_id = `"$KV_ID`""
    Set-Content -Path wrangler.toml -Value $updatedConfig
    Write-Host "KV命名空间ID已更新" -ForegroundColor Yellow
}

$choice = Read-Host "是否要上传 HTML 文件到 KV? (Y/N)"
if ($choice -eq 'N' -or $choice -eq 'n') { exit }

Write-Host "开始上传 HTML 文件到 KV..." -ForegroundColor Green

# 验证KV_ID是否有效
if ([string]::IsNullOrEmpty($KV_ID)) {
    Write-Error "错误：没有有效的KV命名空间ID"
    Read-Host "按任意键退出..."
    exit 1
}

# 上传HTML文件
$htmlFiles = @("index.html", "about.html", "cert.html", "contact.html", "new-post.html", "post.html", "posts.html")
foreach ($file in $htmlFiles) {
    if (Test-Path $file) {
        Write-Host "正在上传 $file..." -ForegroundColor Green
        $result = npx wrangler@latest kv key put $file --path "./$file" --namespace-id $KV_ID --preview false --remote 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "$file 上传失败"
        } else {
            Write-Host "$file 上传成功" -ForegroundColor Green
        }
    } else {
        Write-Warning "文件 $file 不存在，跳过上传"
    }
}

Write-Host "HTML 文件上传完成" -ForegroundColor Green
Read-Host "按任意键继续..."

$choice = Read-Host "是否要部署 Cloudflare Workers? (Y/N)"
if ($choice -eq 'N' -or $choice -eq 'n') { exit }

Write-Host "正在部署 Cloudflare Workers..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "npx wrangler@latest deploy; Read-Host '部署成功，按任意键退出...'" -Wait

Write-Host "所有步骤已完成！" -ForegroundColor Green
Read-Host "按任意键退出..."