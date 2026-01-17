@echo off
npm install -g wrangler
npx wrangler@latest login
echo 上传 KV
for %%F in (*.html) do (
	echo 上传 %%F ...
	npx wrangler@latest kv key put "%%~nxF" --path "%%~fF" --binding PUBLIC_ASSETS --preview false --remote
)
wrangler deploy