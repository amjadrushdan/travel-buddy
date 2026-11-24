import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIcon";

// PNG app icons generated at build time: /icon/192, /icon/512 and /icon/maskable.
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const key = await id;
  const size = key === "192" ? 192 : 512;
  const maskable = key === "maskable";
  return new ImageResponse(<AppIconArt size={size} inset={maskable ? 0.28 : 0.18} rounded={!maskable} />, {
    width: size,
    height: size,
  });
}
