import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIcon";

// iOS home-screen icon (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={180} rounded={false} />, size);
}
