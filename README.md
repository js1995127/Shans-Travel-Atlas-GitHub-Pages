# Shan's Travel Atlas｜傻瓜式旅行照片地图

这是一个已经做好的中英双语旅行网站。你不需要修改代码：只要把照片放进 `photos` 文件夹，上传到 GitHub，网站就会自动读取照片文件名中的地点、查询地图坐标、压缩照片并更新网页。

## 你只需要记住这一条命名规则

```text
地点, 国家__任意编号或说明.jpg
```

例如：

```text
Mexico City, Mexico__001.jpg
Mexico City, Mexico__街头的花.jpg
Dublin, Ireland__雨天.jpg
都柏林, 爱尔兰__001.jpg
```

- 双下划线 `__` 前面是地图要识别的地点。
- `__` 后面可以是编号，也可以是一句照片说明。
- 同一地点可以放很多张照片。
- 最好写成“城市, 国家”，这样不会把同名城市定位到错误的国家。
- 支持 JPG、JPEG、PNG、WebP、AVIF、TIFF 和常见 HEIC/HEIF 文件；个别特殊 HEIC 如果处理失败，会记录在构建报告中，不会让整个网站坏掉。

## 第一次发布：完全按这六步操作

1. 解压下载到的项目文件夹。
2. 安装并打开 [GitHub Desktop](https://desktop.github.com/)；登录你的 GitHub 账号。
3. 在 GitHub Desktop 中选择 **File → Add local repository**，选中这个项目文件夹。如果它提示这还不是 repository，点击 **create a repository**。
4. 把照片复制到 `photos` 文件夹。可以直接放，也可以用子文件夹表示旅程，例如 `photos/2026 墨西哥/`。
5. 在 GitHub Desktop 左下角写一句说明，例如 `add travel photos`，点击 **Commit to main**，再点击顶部的 **Publish repository**。网站需要公开访问时，仓库选择 Public。
6. 打开 GitHub 网页中的仓库，进入 **Settings → Pages**，把 **Source** 选择为 **GitHub Actions**。等待上方 **Actions** 页面出现绿色对勾。

完成后，网站地址通常是：

```text
https://你的GitHub用户名.github.io/仓库名称/
```

以后增加照片，只需要把新照片复制进 `photos`，再在 GitHub Desktop 中点一次 Commit 和 Push。网站会自动重新生成。

## 网站会自动完成什么

- 扫描所有子文件夹中的照片。
- 从文件名读取地点和照片说明。
- 相同地点只查询一次坐标，并缓存结果。
- 读取照片拍摄时间，能够在旅程内按时间排序。
- 自动生成轻量缩略图和大图，不直接把相机原图加载给访客。
- 按地点拆分数据；访客点击某个地点时才加载该地点的照片。
- 提供中英双语界面、世界地图、地点聚合、搜索、旅程筛选、随机旅行和大图浏览。
- 手机、平板和电脑均可使用。
- 世界底图和地图程序已经包含在项目中，不需要申请地图密钥，也不会产生地图账单。

## 如果地图认错了地点

先把文件名写得更具体，例如把 `Cambridge__001.jpg` 改成：

```text
Cambridge, United Kingdom__001.jpg
```

如果仍然不对，可以打开 `location-overrides.json`，仿照里面的示例加入正确经纬度。只有这种少数例外才需要手工处理。

## 关于四万张照片的重要限制

网站代码本身没有设置照片数量上限，并且会按地点分块、按需加载。但是 GitHub Pages 官方规定：**单个发布网站最大约 1 GB**。四万张相机原图不可能全部直接放在 GitHub Pages 中。

因此建议分两步：

1. 先用这个版本发布约几百到一两千张精选照片，确认视觉风格和使用方式。
2. 完整四万张版本继续使用同一个网站界面，但把照片移到对象存储/CDN中；GitHub Pages只保存网页和地图数据。

不要为了节省空间删除原始照片。本项目只负责生成网页版本，原始照片仍应保存在你的硬盘和备份中。

## 想修改网站名字

打开 `settings.json`，只修改引号内的文字：

```json
{
  "titleZh": "山的世界旅行地图",
  "titleEn": "Shan's Travel Atlas"
}
```

其他内容不用动。

## 隐私提醒

GitHub Pages网站是公开网页。不要放入证件、家庭住址、私人聚会或不希望陌生人看到的照片。网站生成的WebP版本不会保留原照片的完整EXIF元数据，但照片本身仍可能暴露地点或人物信息。

## 本地预览（可选）

你不需要执行这些命令才能使用GitHub版本。如果以后想在电脑上先预览，需要安装 Node.js 22，然后在项目文件夹中运行：

```bash
npm install
npm run build
npm run preview
```
