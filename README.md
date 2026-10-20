# 面部注射采集台

注射师用手机采集规范化病例数据（同意、注射记录、照片与针位、复诊评估），导出为训练数据集的 PWA。
需求规格（SPEC.md）与设计稿（design/）只保存在本机，不在仓库中。数据只存在设备本地（IndexedDB），无后端。

## 开发

```bash
npm install
npm run dev      # http://localhost:5173，手机同一局域网可访问（相机需 HTTPS 时见下）
npm test         # 单元测试：坐标归一化、状态推导、CSV/数据集导出、备份往返、质量检查
npm run build    # 产物在 dist/，含 Service Worker
npm run preview  # 本地预览构建结果（可测离线）
```

开发环境下，在浏览器控制台运行 `__seed()` 会清空本机数据并写入与设计稿一致的 4 个示例病例（合成照片）。

`node scripts/make-icons.mjs` 重新生成 PWA 图标 PNG。

## 部署

`npm run build` 后把 `dist/` 整个上传到任意 HTTPS 静态托管即可（资源路径为相对路径，可放在子目录）。
不需要服务器端逻辑，服务器不接收任何照片或记录。

## 结构

```
src/lib/        纯逻辑与存储：model（数据模型）、caseLogic（状态/摘要/复诊窗口）、geometry（瞳孔坐标系）、
                quality（亮度/模糊检查）、image（EXIF 纠正 + 缩放 + 重新编码）、dataset / backup / zip / csv、db（IndexedDB）
src/screens/    Home 病例列表、Consent ①、Treatment ②、Photos ③、Followup ④、Export 导出、Settings 设置与备份
src/components/ Annotator（针位标注）、FileJob（打包与保存）、通用控件
```

## 与需求规格的差异 / 实现说明

- `Case.subject` 的年龄段、性别、肤色在新建时为 `null`（未选），完成第 1 步后才有值。
- 新增 `Case.pupils`：标注所用的瞳孔像素坐标，调整瞳孔后会重算所有点的 `norm` 与方向。
- `direction` 存的是瞳孔坐标系下的单位向量；`points.csv` 在规格列之后追加了 `point_id, photo, px_x, px_y`。
- `case.json` 与 CSV 不含同意书编号和签署日期；导出要求“研究用途”和“AI 训练用途”两项同意都勾选（设计稿 5-Dataset 的规则）。
- 照片文件名按规格为 `<phase>_<view>.jpg`，复诊阶段是 `followup_*.jpg`（设计稿示意图里写的是 `post_*`）。
- 复诊取景叠加（getUserMedia）按规格第 9 节暂未实现；复诊未拍的格子里会淡显术前同角度照片作参考。
- 质量检查只分析画面中央区域；`src/lib/quality.ts` 里的阈值是初值，需要用真实照片校准。
- 首页备份提醒在超过 7 天未备份（或从未备份）时显示。
