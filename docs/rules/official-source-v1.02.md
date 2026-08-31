# 官方规则来源清单：综合规则书 1.02

## 来源判定

- 发布账号：漫威对战卡牌超英击战
- 动态地址：https://www.bilibili.com/opus/1215218386076696596
- 动态编号：cv50678361
- 动态编辑时间：2026-07-23 19:59
- 动态标题：漫威对战卡牌《超英击战》综合规则书1.01
- 正文实际版本：1.02
- 规则书封面更新日期：2026-07-23

动态标题与正文版本不一致。规则书封面和第 13—15 页更新履历互相印证，因此项目采用 1.02。

## 存储策略

- Git 仓库仅保存本清单、结构化规则基线和实现验收文档。
- 17 张官方原图共 141,667,633 字节，保存在：
  `F:\Projects\Hero-Rush\source-library\rules\official-v1.02`
- 归档目录另含可重复抓取原图的 `fetch_official_images.py`。
- 不要把该目录复制到仓库，也不要提交原图；需要核对时按下列 SHA-256 验证。

## 文件校验

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| 00-cover.png | 3,325,687 | `b8735c235b149ff43454b9a441dc65114f643beaf1b426f6e1ffbe881b50acaa` |
| page-01.png | 7,962,232 | `7bff3f2400617f04930773415eef1122941c17b61a72f2e9f3a30fb477b3ffbb` |
| page-02.png | 8,930,693 | `799cc10aebb39e502297c4c72f09828342361f72b1d9738a7adbbe0775080515` |
| page-03.png | 8,998,923 | `9ac79601e805cfdfbe02f5c94dcd485871f5801a245083334b03b960e9408e05` |
| page-04.png | 8,675,473 | `e22a9374c7cfa51306c2514de01a555f05c8117e190ac273ccea5e6b96fd1e8d` |
| page-05.png | 8,957,595 | `ad09e3fc5a5a6c79a9aa28c7006b72f6960033c87406187844b293d46c4701c0` |
| page-06.png | 9,316,546 | `a89cff73fedead283f9bb8071692e8ab30ede3895f5d072d7c5df5e06602b216` |
| page-07.png | 9,558,856 | `edf50b8c06cabf08bc8163fdb15f69c8aad1bb1c85bf6c8cb3847e657d2b5ce7` |
| page-08.png | 8,766,262 | `c1765e66cc19e897daf70ff3fb30b6a7783092af3eafdf4478af43ed4350e03b` |
| page-09.png | 9,054,688 | `2b9f233b71e6588ce19c90c31a8e67ec5bd2ceb3e6b5f5ba83d3ff110463a402` |
| page-10.png | 9,230,722 | `35b2e653f820662c8eebec8efb76fb881bba818f6f8672ee71c89b526555574f` |
| page-11.png | 9,372,977 | `4139f04229acb73c242bf67489ff61458cc9d710dc8dec12e0c1f0c507b33f20` |
| page-12.png | 7,740,093 | `f285de403bc22f0bd69b920034bcc61b717d2837c7e92da1cd515ee11407fff1` |
| page-13.png | 9,019,944 | `8eda33cf0fb759be4e22c5ba7d00e05204b12ecbac37a1a680be1c2e79fb147e` |
| page-14.png | 9,309,529 | `3cb1410457dcbd8fd8aa483181984ba05068f554430ab9f36929bddfe685364b` |
| page-15.png | 6,989,474 | `b1f31217f525617309f3be796899388c2441120b8e68ecacb3868efda85e2b4a` |
| page-16.png | 6,457,939 | `86402457ba2e93d8811d281c24e86aacf592eb9cc674ff9ef6b945d1c2ba7625` |

## 页面用途

- 00-cover.png：Bilibili 动态宣传图，不是规则书正文封面。
- page-01.png—page-12.png：1.02 正文。
- page-13.png—page-15.png：1.00、1.01、1.02 更新履历。
- page-16.png：版权标识和结束页。

## 核验流程

1. 先核对本文件中的来源地址、版本和更新时间。
2. 对争议条文，在 F 盘打开相应页原图。
3. 校验文件 SHA-256，排除图片被替换或损坏。
4. 若官方发布更新，建立新的 `official-vX.YY` 目录和新清单，不覆盖旧归档。
