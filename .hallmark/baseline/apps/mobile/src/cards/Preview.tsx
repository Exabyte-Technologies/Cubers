import React from "react";
import { Image } from "react-native";
import { type CardImage } from "@cubers/core";
export function CardPreview({
  image,
  label,
}: {
  image: CardImage;
  label: string;
}) {
  return (
    <Image
      accessible
      accessibilityLabel={label}
      source={{ uri: `data:image/png;base64,${image.base64}` }}
      style={{ width: "100%", aspectRatio: 0.8, borderRadius: 18 }}
      resizeMode="contain"
    />
  );
}
