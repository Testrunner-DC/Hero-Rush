import os
import glob
from PIL import Image

# 配置
INPUT_DIR = r"C:\Users\neptu\WorkBuddy\20260430022315\超英击战_卡图"
OUTPUT_DIR = r"C:\Users\neptu\WorkBuddy\20260430022315\超英击战_卡图_处理后"
TARGET_WIDTH = 746
TARGET_HEIGHT = 1041

# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 获取所有 PNG 文件
png_files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.png")))
print(f"找到 {len(png_files)} 张图片")

def trim_borders(img):
    """裁剪空白/透明边"""
    # 转为 RGBA 模式以处理透明
    img_rgba = img.convert("RGBA")
    # getbbox 返回非零/非透明区域边界框
    bbox = img_rgba.getbbox()
    if bbox:
        return img_rgba.crop(bbox)
    return img_rgba

def resize_to_target(img, target_w, target_h):
    """
    将图片缩放到目标尺寸，保持比例，采用居中覆盖裁剪策略：
    1. 计算目标宽高比和原图宽高比
    2. 先缩放到能完整覆盖目标尺寸的等比例大小
    3. 再从中心裁剪出目标尺寸
    这样图片不会变形，且能填满目标尺寸。
    """
    target_ratio = target_w / target_h
    img_ratio = img.width / img.height

    if img_ratio > target_ratio:
        # 图片更宽，按高度缩放
        new_height = target_h
        new_width = int(target_h * img_ratio)
    else:
        # 图片更高或等比，按宽度缩放
        new_width = target_w
        new_height = int(target_w / img_ratio)

    img_resized = img.resize((new_width, new_height), Image.LANCZOS)

    # 从中心裁剪
    left = (new_width - target_w) // 2
    top = (new_height - target_h) // 2
    right = left + target_w
    bottom = top + target_h

    return img_resized.crop((left, top, right, bottom))

processed = 0
for fpath in png_files:
    fname = os.path.basename(fpath)
    try:
        with Image.open(fpath) as img:
            # 步骤1: 裁剪空白边
            trimmed = trim_borders(img)
            # 步骤2: 缩放到目标尺寸
            result = resize_to_target(trimmed, TARGET_WIDTH, TARGET_HEIGHT)
            # 保存
            out_path = os.path.join(OUTPUT_DIR, fname)
            result.save(out_path, "PNG")
            processed += 1
            if processed % 20 == 0:
                print(f"  已处理 {processed}/{len(png_files)} 张...")
    except Exception as e:
        print(f"  ❌ {fname} 处理失败: {e}")

print(f"\n✅ 完成！共处理 {processed} 张图片")
print(f"输出目录: {OUTPUT_DIR}")
