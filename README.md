# ColorArea
![image](https://github.com/PJY1548/ColorArea/blob/main/preview.png)
## 简介：
### 一个Cloudflare Worker论坛示例
### 只要一个Cloudflare账户，轻松使用cloudflare Worker建立简易论坛
## -------- 部署方式 --------
### 1.[安装Node.js](https://nodejs.cn/en/download)，cmd测试node npm是否正常
### 2.下载发布版本，存放至安装目录，右键run.ps1，使用powershell运行
### 3.正常完成安装程序
#### 请注意所有执行结果，保证过程不出错
#### 如果出现错误，请至cloudflare面板删除创建的Workers KV（PUBLIC_ASSETS）与D1 SQL数据库（color-db）
#### 然后重试
### 4.登录cloudflare查看Worker，如有需要可以添加自己域名的路由
