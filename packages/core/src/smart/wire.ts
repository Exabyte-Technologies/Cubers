// Bounded base64 conversion without browser globals or Node Buffer, for native BLE.
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function smartBytes(value: string) {
  if (
    !value.length ||
    value.length > 348 ||
    value.length % 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("Invalid Bluetooth value");
  const result: number[] = [];
  for (let at = 0; at < value.length; at += 4) {
    const a = alphabet.indexOf(value[at]),
      b = alphabet.indexOf(value[at + 1]);
    const c = alphabet.indexOf(value[at + 2]),
      d = alphabet.indexOf(value[at + 3]);
    result.push((a << 2) | (b >> 4));
    if (c >= 0) result.push(((b & 15) << 4) | (c >> 2));
    else if (b & 15) throw new Error("Noncanonical Bluetooth value");
    if (d >= 0) result.push(((c & 3) << 6) | d);
    else if (c >= 0 && c & 3) throw new Error("Noncanonical Bluetooth value");
  }
  if (result.length > 260) throw new Error("Bluetooth value too large");
  return Uint8Array.from(result);
}
export function smartBase64(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 260)
    throw new Error("Invalid Bluetooth value size");
  let result = "";
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at],
      b = bytes[at + 1],
      c = bytes[at + 2];
    result +=
      alphabet[a >> 2] +
      alphabet[((a & 3) << 4) | ((b || 0) >> 4)] +
      (b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c || 0) >> 6)]) +
      (c === undefined ? "=" : alphabet[c & 63]);
  }
  return result;
}
export function smartCandidate(model: string, name: string) {
  if (name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) return false;
  if (model === "gan-356-i3") return /^GAN/i.test(name);
  if (model === "giiker-i3s") return /^GiS/i.test(name);
  return (
    model === "gocube-edge" &&
    /^GoCube/i.test(name) &&
    !/^GoCube\s*X/i.test(name)
  );
}
// Manufacturer data includes its two-byte company identifier. Accept only the
// known nine-byte GAN payload, never infer an address from unrelated packets.
export function ganAdvertisementAddress(data: Uint8Array) {
  if (data.length !== 11 || data[0] !== 1) return undefined;
  return [...data.slice(-6)]
    .reverse()
    .map((v) => v.toString(16).padStart(2, "0"))
    .join(":");
}
