# KuaishouAINexus-D
极枢·快手全链路 AI 引擎 (Nexus-D) 🚀
# 快手视频信息拦截与解析 (AI神评论增强版) 🚀
## __NS_sig3 算法 逆向可以参考：https://blog.csdn.net/CXY00000/article/details/158772278?spm=1001.2014.3001.5501
# 商业使用或者二开请自觉遵守协议，欢迎各位参与项目维护，主页还有其它主流短视频平台的自动化交互方案，欢迎交流学习

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Tampermonkey-red.svg)

全功能终极版快手网页端辅助脚本。集成全自动AI智能评论、动态播控、赞藏模拟、数据抓取提取以及无水印视频下载等强大功能。专为运营者、数据分析师及自动化需求用户打造。

---

## 🌟 核心功能详解 (Features)

### 🤖 1. AI 智能评论引擎 (AI Magic Comment)
- **多模式支持**：支持**固定话术随机抽取**、**本地AI模型**（如 Ollama/DeepSeek-r1）以及**在线大模型API**。
- **上下文感知**：自动抓取当前视频的标题、作者、标签，以此为 Context 向 AI 发送 Prompt，生成契合视频内容的定制化神评论。
- **流式输出支持 (Stream)**：支持解析 API 的流式数据传输，实时处理响应。
- **防重机制 (FIFO)**：内置 30 条历史评论记录队列，精准识别已评视频，自动触发极速跳过保护，杜绝重复黑号风险。

### 🚀 2. 全自动播控与防风控机制 (Auto Switch & Anti-Ban)
- **智能倒计时连播**：强制接管系统连播，支持自定义（如 10秒 ~ 30秒）随机停留时间，模拟真人观看行为。
- **抓取任务挂起保护**：倒计时结束后，若当前视频的评论数据仍在深度抓取中，播控引擎将自动**挂起等待**，直到队列清空后再切换视频，确保数据不丢失。
- **异常恢复**：连续切换失败10次自动强制刷新页面，防止页面卡死。

### ❤️ 3. 深度交互模拟 (Auto Interactions)
- **评论后置触发机制**：在评论发送成功后，系统会随机延迟 1~2 秒，随后判定是否点赞和收藏，完美模拟真人看完视频有感而发的连贯动作。
- **概率触发**：支持在 UI 面板中滑动设置点赞与收藏的触发概率（0% - 100%）。

### 📥 4. 嗅探下载与导出模块 (Download & Export)
- **无水印嗅探**：深度解析视频最高画质（支持 H.265 / 主路由提取）无水印 MP4 下载链接。
- **Motrix (Aria2) 联动**：支持通过 RPC 一键推送至本地 Motrix 下载器，并自动创建 `www.kuaishou.com/作者名/视频名.mp4` 层级目录。同时提供浏览器原生 API 下载兜底方案。

### 📊 5. 全局数据抓取与分析 (Data Scraping)
- **层级评论抓取**：递归式抓取视频的主评论与子评论（楼中楼），突破系统折叠限制。
- **主页批量解析**：进入创作者主页时，可一键或自动深度提取作者信息及该账号下的所有视频数据（播放量、点赞量、发布时间、无水印链接等）。
- **一键导出 Excel**：内置 SheetJS 引擎，无论是视频评论还是主页视频列表，均可一键导出为 `XLSX` 标准报表文件。

### 🎨 6. 现代化交互 UI (Modern UI)
- **全局气泡通知 (Toast)**：全流程透明化，不同状态显示不同颜色的气泡提示（如报错为红色，成功为绿色，挂起为蓝色）。
- **可拖拽悬浮球**：动态反馈当前任务状态（倒计时、抓取中、完成等），并支持自动记忆拖拽位置。
- **深色模式 (Dark Mode)**：面板适配快手网页版的深色主题。

---

## 🛠️ 安装说明 (Installation)

1. **安装环境**：确保您的浏览器已安装 [Tampermonkey (油猴)](https://www.tampermonkey.net/) 插件。
2. **导入脚本**：新建一个用户脚本，将本项目的完整代码复制并粘贴进去，按 `Ctrl + S` 保存。
3. **开启服务**：访问 `https://www.kuaishou.com/`，在页面右侧会出现悬浮闪电球 `⚡`，点击即可展开配置面板。

---

## ⚙️ 配置指南 (Configuration)

### 配合本地大模型 (如 Ollama)
1. 确保本地已启动大模型 API（默认地址通常为 `http://127.0.0.1:11434/api/generate`）。
2. 在脚本的悬浮设置面板中 -> 选择 **"自动评论模块"** -> 切换至 **"本地AI"**。
3. 填入模型名称（例如 `deepseek-r1:1.5b`）。

### 配合 Motrix 实现静默批量下载
1. 开启本地 Motrix 软件。
2. 在高级设置中确认 RPC 端口（通常为 `16800`）。
3. 在脚本面板中勾选 **"无水印下载模块"** -> **"优先调用 Motrix (Aria2)"**。
4. RPC 链接填写 `http://127.0.0.1:16800/jsonrpc`，保存配置即可生效。

---

## 📜 协议声明 (License)

本项目采用 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)** 协议开源。

- **允许**：您可以自由地使用、复制、修改和分发本代码。
- **限制**：**严禁将本代码用于任何商业性用途（如代运营牟利、打包收费售卖等）**。如基于此项目进行二次开发或修改，必须以相同协议开源，并注明原作者署名。
- **免责声明**：本脚本仅供学习与技术研究使用。请合理控制抓取与评论频率，因过度滥用导致的账号风控或封禁，作者概不负责。

---
---

# Kuaishou Video Info Interceptor & Parser (AI Magic Comment Enhanced Edition) 🚀

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Tampermonkey-red.svg)

The ultimate all-in-one Tampermonkey script for Kuaishou's web version. It integrates a fully automated AI smart comment engine, dynamic playback control, simulated interactions (likes/saves), robust data scraping, and watermark-free video downloads. Built specifically for operations staff, data analysts, and automation enthusiasts.

---

## 🌟 Key Features

### 🤖 1. AI Smart Comment Engine
- **Multiple Modes**: Supports **randomized fixed templates**, **Local AI Models** (e.g., Ollama/DeepSeek-r1), and **Online LLM APIs**.
- **Context-Aware**: Automatically scrapes the video's title, author, and tags to formulate a prompt, generating highly relevant and customized "magic comments."
- **Streaming Output**: Supports streaming data parsing for real-time response processing.
- **Anti-Duplication (FIFO)**: Features a built-in cache queue of the last 30 replied videos. Prevents duplicate commenting and protects against account bans via a fast-skip mechanism.

### 🚀 2. Automated Playback & Anti-Ban Mechanism
- **Smart Countdown Switch**: Overrides the system's auto-play with a customizable random interval (e.g., 10s - 30s) to simulate human watching behavior.
- **Scraping Task Suspension Protection**: If the countdown ends but background scraping (like loading nested comments) is still active, the switch engine will "hang and wait" until the queue is completely processed to ensure zero data loss.
- **Auto-Recovery**: Automatically refreshes the page if video switching fails 10 consecutive times.

### ❤️ 3. Deep Interaction Simulation
- **Post-Comment Trigger Mechanism**: Waits for a random delay (1-2 seconds) *after* a comment is successfully sent before evaluating whether to like and collect the video, mimicking natural human behavior perfectly.
- **Probability Control**: Adjustable sliding scale (0% - 100%) in the UI panel for granular control over like and collect probabilities.

### 📥 4. Sniffing Download & Export Module
- **Watermark-Free Sniffing**: Deeply analyzes and extracts the highest quality (supports H.265) watermark-free MP4 video links.
- **Motrix (Aria2) Integration**: Features one-click RPC push to a local Motrix downloader, automatically creating organized folders (`www.kuaishou.com/AuthorName/VideoName.mp4`). Fallback to native browser API downloading is provided.

### 📊 5. Global Data Scraping & Analytics
- **Nested Comment Scraping**: Recursively fetches main comments and sub-comments, bypassing UI display limitations.
- **Profile Batch Parsing**: When visiting a creator's profile, it can deeply extract the creator's metadata and iteratively fetch their entire video feed (views, likes, post times, direct links).
- **One-Click Excel Export**: Powered by the SheetJS engine, allowing both scraped comments and profile video lists to be exported cleanly into `.xlsx` standard reports.

### 🎨 6. Modern Interactive UI
- **Global Toast Notifications**: Fully transparent workflow. Color-coded floating notifications for different statuses (e.g., red for errors, green for success, blue for pending).
- **Draggable Floating Action Button (FAB)**: Dynamically reflects the current task state (countdown, processing, complete) and saves its position automatically.
- **Dark Mode Support**: UI panel adapts beautifully to Kuaishou's web dark theme.

---

## 🛠️ Installation

1. **Environment**: Ensure you have the [Tampermonkey](https://www.tampermonkey.net/) extension installed in your browser.
2. **Import Script**: Create a new userscript, paste the complete code of this project, and press `Ctrl + S` to save.
3. **Activate**: Visit `https://www.kuaishou.com/`. A floating lightning bolt `⚡` will appear on the right side of the screen. Click it to open the configuration panel.

---

## ⚙️ Configuration Guide

### Using Local Large Models (e.g., Ollama)
1. Ensure your local model API is running (default is usually `http://127.0.0.1:11434/api/generate`).
2. Open the script's UI panel -> Select the **"Automated Comment Module"** -> Switch tab to **"Local AI"**.
3. Enter your model name (e.g., `deepseek-r1:1.5b`).

### Silent Batch Downloading via Motrix
1. Launch your local Motrix application.
2. Check the RPC port in Motrix's advanced settings (usually `16800`).
3. In the script panel, toggle **"Download Module"** -> **"Prioritize Motrix (Aria2)"**.
4. Set the RPC URL to `http://127.0.0.1:16800/jsonrpc` and save.

---

## 📜 License & Disclaimer

This project is open-sourced under the **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)** license.

- **Allowed**: You are free to use, copy, modify, and distribute this code.
- **Restrictions**: **Strictly NO commercial use (e.g., selling as a service, packaging for paid distribution, etc.)**. Any derivative works must be released under the same license and credit the original author.
- **Disclaimer**: This script is strictly for educational and technical research purposes. Please regulate your scraping and commenting frequency reasonably. The author takes no responsibility for account restrictions or bans resulting from abuse.
