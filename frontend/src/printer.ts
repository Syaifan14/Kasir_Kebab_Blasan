import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Bluetooth thermal printer service (58mm ESC/POS).
 * Uses react-native-bluetooth-classic which requires a native build.
 * In Expo Go the module import fails gracefully and `isAvailable()` returns false.
 */

let RNBluetoothClassic: any = null;
let importError: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNBluetoothClassic = require("react-native-bluetooth-classic").default;
} catch (e: any) {
  importError = e?.message || "Native module unavailable";
}

const KEY_DEFAULT_DEVICE = "kebab_blasan_printer_device_v1";

export type PrinterDevice = { name: string; address: string };

// ---------- ESC/POS command builder ----------
const ESC = 0x1b;
const GS = 0x1d;

function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function align(a: "left" | "center" | "right"): number[] {
  const n = a === "left" ? 0 : a === "center" ? 1 : 2;
  return [ESC, 0x61, n];
}

function bold(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0];
}

function size(n: number): number[] {
  // n: 0 = normal, 1 = double height/width
  return [GS, 0x21, n];
}

function line(text = ""): number[] {
  return [...utf8(text), 0x0a];
}

function feed(n: number): number[] {
  return [ESC, 0x64, n];
}

function cut(): number[] {
  return [GS, 0x56, 0x00];
}

function init(): number[] {
  return [ESC, 0x40]; // ESC @ - initialize
}

// Two-column line for 32-col paper (58mm)
function twoCol(left: string, right: string, width = 32): string {
  const l = left.slice(0, width - right.length - 1);
  const spaces = " ".repeat(Math.max(1, width - l.length - right.length));
  return l + spaces + right;
}

function formatIDRCompact(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export function buildReceiptBytes(txn: any): Uint8Array {
  const bytes: number[] = [];
  bytes.push(...init());
  bytes.push(...align("center"));
  bytes.push(...bold(true), ...size(0x11)); // double h+w
  bytes.push(...line("KEBAB BLASAN"));
  bytes.push(...size(0));
  bytes.push(...bold(false));
  bytes.push(...line("Struk Pembelian"));
  bytes.push(...align("left"));
  bytes.push(...line("--------------------------------"));
  bytes.push(...line(`No   : ${txn.order_no}`));
  bytes.push(...line(`Kasir: ${txn.cashier_name}`));
  const t = new Date(txn.created_at);
  bytes.push(...line(`Tgl  : ${t.toLocaleString("id-ID")}`));
  bytes.push(...line("--------------------------------"));
  for (const it of txn.items || []) {
    bytes.push(...line(`${it.quantity}x ${it.product_name}`));
    bytes.push(...line(twoCol("  Base", formatIDRCompact(it.base_price * it.quantity))));
    for (const tp of it.toppings || []) {
      bytes.push(...line(twoCol(`  +${tp.name}`, formatIDRCompact(tp.price * it.quantity))));
    }
    if (it.spice_level) bytes.push(...line(`  Pedas: ${it.spice_level}`));
    if (it.notes) bytes.push(...line(`  Note : ${it.notes}`));
  }
  bytes.push(...line("--------------------------------"));
  if (txn.discount && txn.discount > 0) {
    bytes.push(...line(twoCol("Subtotal", formatIDRCompact(txn.subtotal))));
    const dLabel = txn.voucher_code ? `Diskon (${txn.voucher_code})` : "Diskon";
    bytes.push(...line(twoCol(dLabel, "-" + formatIDRCompact(txn.discount))));
  }
  bytes.push(...bold(true));
  bytes.push(...line(twoCol("TOTAL", formatIDRCompact(txn.total))));
  bytes.push(...bold(false));
  if (txn.payment_method === "cash") {
    bytes.push(...line(twoCol("Tunai", formatIDRCompact(txn.cash_received || txn.total))));
    bytes.push(...line(twoCol("Kembali", formatIDRCompact(txn.change || 0))));
  } else if (txn.payment_method === "qris") {
    bytes.push(...line(twoCol("QRIS", formatIDRCompact(txn.total))));
  } else if (txn.payment_method === "split") {
    bytes.push(...line(twoCol("Tunai", formatIDRCompact(txn.cash_amount || 0))));
    bytes.push(...line(twoCol("QRIS", formatIDRCompact(txn.qris_amount || 0))));
  }
  bytes.push(...line("--------------------------------"));
  bytes.push(...align("center"));
  bytes.push(...line("Terima kasih!"));
  bytes.push(...line("Selamat menikmati"));
  bytes.push(...feed(4));
  bytes.push(...cut());
  return new Uint8Array(bytes);
}

// ---------- Public API ----------
export function isBluetoothAvailable(): boolean {
  return !!RNBluetoothClassic && Platform.OS !== "web";
}

export function bluetoothUnavailableReason(): string {
  if (Platform.OS === "web") return "Bluetooth tidak tersedia di web";
  if (!RNBluetoothClassic) return importError || "Butuh native build (tidak berfungsi di Expo Go)";
  return "";
}

export async function ensureEnabled(): Promise<boolean> {
  if (!isBluetoothAvailable()) return false;
  try {
    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (enabled) return true;
    if (Platform.OS === "android") {
      return await RNBluetoothClassic.requestBluetoothEnabled();
    }
    return false;
  } catch {
    return false;
  }
}

export async function listPairedDevices(): Promise<PrinterDevice[]> {
  if (!isBluetoothAvailable()) return [];
  const devs = await RNBluetoothClassic.getBondedDevices();
  return devs.map((d: any) => ({ name: d.name || "Unknown", address: d.address }));
}

export async function getSavedDevice(): Promise<PrinterDevice | null> {
  const s = await AsyncStorage.getItem(KEY_DEFAULT_DEVICE);
  return s ? JSON.parse(s) : null;
}

export async function saveDevice(d: PrinterDevice | null) {
  if (d) await AsyncStorage.setItem(KEY_DEFAULT_DEVICE, JSON.stringify(d));
  else await AsyncStorage.removeItem(KEY_DEFAULT_DEVICE);
}

export async function printReceipt(txn: any): Promise<{ ok: boolean; error?: string }> {
  if (!isBluetoothAvailable()) {
    return { ok: false, error: bluetoothUnavailableReason() };
  }
  const dev = await getSavedDevice();
  if (!dev) return { ok: false, error: "Belum memilih printer default" };
  try {
    await ensureEnabled();
    const bytes = buildReceiptBytes(txn);
    const connected = await RNBluetoothClassic.connectToDevice(dev.address, {
      CONNECTOR_TYPE: "rfcomm",
      DELIMITER: "\n",
    });
    // Write raw bytes. Library accepts base64 for binary.
    const b64 = base64Encode(bytes);
    await connected.write(b64, "base64");
    try {
      await connected.disconnect();
    } catch {}
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Gagal mencetak" };
  }
}

function base64Encode(bytes: Uint8Array): string {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const t = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += CHARS[(t >> 18) & 63] + CHARS[(t >> 12) & 63] + CHARS[(t >> 6) & 63] + CHARS[t & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const t = bytes[i] << 16;
    out += CHARS[(t >> 18) & 63] + CHARS[(t >> 12) & 63] + "==";
  } else if (rem === 2) {
    const t = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += CHARS[(t >> 18) & 63] + CHARS[(t >> 12) & 63] + CHARS[(t >> 6) & 63] + "=";
  }
  return out;
}
