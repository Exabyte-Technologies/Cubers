import { z } from "zod";
import { Region } from "./contracts";

const translatedText = z.object({ en: z.string(), zh: z.string() });
export const PublicLegalDocument = z.object({
  title: translatedText,
  body: translatedText,
  actionUrl: z.string().url().optional(),
  operator: z.object({
    region: Region,
    name: translatedText,
    address: translatedText,
    email: z.string().email(),
    website: z.string().url().startsWith("https://"),
  }),
});
export type PublicLegalDocument = z.infer<typeof PublicLegalDocument>;

// Public operator details supplied by the owner; no filing or approval is implied.
export function publicOperator(region: Region) {
  const nameZh = "北京聚缘琴科技有限公司",
    addressZh = "北京市海淀区上地十街1号院5号楼17层1704室，邮政编码100000";
  return {
    region,
    name: {
      en: region === "CN" ? nameZh : "Beijing Juyuanqin Technology Co., Ltd.",
      zh: nameZh,
    },
    address: {
      en:
        region === "CN"
          ? addressZh
          : "1704, Floor 17, Building 5, No.1 Courtyard, Shangdi 10th Street, Haidian District, Beijing 100000, China",
      zh: addressZh,
    },
    email: "support@exabyte.org.cn",
    website:
      region === "CN" ? "https://juyuanqin.com" : "https://exabyte.org.cn",
  };
}
