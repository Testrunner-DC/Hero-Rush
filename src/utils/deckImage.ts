import type { Card, Deck } from "../types/card";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片加载失败：${url}`));
    image.src = url;
  });
}

export async function createDeckImageBlob(deck: Deck, cardMap: Map<string, Card>): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持生成卡组图");

  context.fillStyle = "#fcfaf7";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1c1917";
  context.font = "bold 42px Microsoft YaHei";
  context.fillText(deck.name || "未命名卡组", 60, 70);
  context.fillStyle = "#78716c";
  context.font = "20px Microsoft YaHei";
  context.fillText(`主卡组 ${deck.main_deck.reduce((sum, entry) => sum + entry.count, 0)} 张 · Hero-Rush`, 60, 105);

  const cards = deck.main_deck
    .map((entry) => ({ entry, card: cardMap.get(entry.card_no) }))
    .filter((item): item is { entry: Deck["main_deck"][number]; card: Card } => Boolean(item.card));
  const columns = 10;
  const cardWidth = 132;
  const cardHeight = 184;
  const gap = 14;
  const startX = 60;
  const startY = 135;

  await Promise.all(cards.slice(0, 40).map(async ({ entry, card }, index) => {
    const x = startX + (index % columns) * (cardWidth + gap);
    const y = startY + Math.floor(index / columns) * (cardHeight + 20);
    try {
      const image = await loadImage(card.image_url);
      context.drawImage(image, x, y, cardWidth, cardHeight);
    } catch {
      context.fillStyle = "#e7e5e4";
      context.fillRect(x, y, cardWidth, cardHeight);
    }
    context.fillStyle = "#dc2626";
    context.beginPath();
    context.arc(x + cardWidth - 12, y + 14, 17, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "white";
    context.font = "bold 17px Microsoft YaHei";
    context.textAlign = "center";
    context.fillText(`×${entry.count}`, x + cardWidth - 12, y + 20);
    context.textAlign = "left";
  }));

  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("卡组图生成失败")),
    "image/png",
  ));
}

export async function downloadDeckImage(deck: Deck, cardMap: Map<string, Card>): Promise<void> {
  const blob = await createDeckImageBlob(deck, cardMap);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${deck.name || "卡组"}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}
