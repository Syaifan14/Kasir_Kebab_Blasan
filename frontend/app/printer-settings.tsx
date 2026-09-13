import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  isBluetoothAvailable,
  bluetoothUnavailableReason,
  ensureEnabled,
  listPairedDevices,
  getSavedDevice,
  saveDevice,
  PrinterDevice,
} from "@/src/printer";
import { colors } from "@/src/theme";

export default function PrinterSettings() {
  const insets = useSafeAreaInsets();
  const available = isBluetoothAvailable();
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [selected, setSelected] = useState<PrinterDevice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!available) {
        setError(bluetoothUnavailableReason());
        setLoading(false);
        return;
      }
      const enabled = await ensureEnabled();
      if (!enabled) {
        setError("Bluetooth tidak aktif. Nyalakan Bluetooth lalu coba lagi.");
      } else {
        const devs = await listPairedDevices();
        setDevices(devs);
      }
      setSelected(await getSavedDevice());
    } catch (e: any) {
      setError(e?.message || "Gagal memuat perangkat");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (d: PrinterDevice) => {
    await saveDevice(d);
    setSelected(d);
  };

  const clear = async () => {
    await saveDevice(null);
    setSelected(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} testID="back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Printer Bluetooth</Text>
          <Text style={styles.hSub}>Pilih thermal printer 58mm</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={refresh} testID="btn-refresh">
          <Icon name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {!available && (
        <View style={styles.warnBox}>
          <Icon name="information" size={20} color={colors.onWarning} />
          <Text style={styles.warnTxt}>
            Fitur Bluetooth hanya bekerja pada build native. Publish aplikasi dulu, lalu install
            build APK/IPA di HP untuk menggunakan fitur cetak.
          </Text>
        </View>
      )}

      {selected && (
        <View style={styles.selBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selLabel}>Printer aktif</Text>
            <Text style={styles.selName}>{selected.name}</Text>
            <Text style={styles.selAddr}>{selected.address}</Text>
          </View>
          <Pressable style={styles.clearBtn} onPress={clear} testID="btn-clear-printer">
            <Icon name="close" size={18} color={colors.onError} />
          </Pressable>
        </View>
      )}

      {error && (
        <View style={styles.errBox}>
          <Icon name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errTxt}>{error}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Perangkat Terpasang (paired)</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.brandPrimary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.address}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 8 }}
          ListEmptyComponent={
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 20 }}>
              {available
                ? "Tidak ada perangkat terpasang. Pair printer via Settings > Bluetooth dulu."
                : "Perangkat tidak dapat dipindai di lingkungan ini."}
            </Text>
          }
          renderItem={({ item }) => {
            const active = selected?.address === item.address;
            return (
              <Pressable
                onPress={() => pick(item)}
                style={[styles.devRow, active && styles.devRowActive]}
                testID={`dev-${item.address}`}
              >
                <Icon
                  name={active ? "printer-check" : "printer"}
                  size={22}
                  color={active ? colors.onBrandPrimary : colors.onSurface}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.devName, active && { color: colors.onBrandPrimary }]}>{item.name}</Text>
                  <Text style={[styles.devAddr, active && { color: colors.onBrandPrimary, opacity: 0.85 }]}>
                    {item.address}
                  </Text>
                </View>
                {active && <Icon name="check-circle" size={22} color={colors.onBrandPrimary} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  hTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  warnBox: {
    marginHorizontal: 16, padding: 12, borderRadius: 12,
    backgroundColor: colors.warning, flexDirection: "row", gap: 8, alignItems: "flex-start",
  },
  warnTxt: { flex: 1, color: colors.onWarning, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  selBox: {
    marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14,
    backgroundColor: colors.brandTertiary, flexDirection: "row", alignItems: "center", gap: 12,
  },
  selLabel: { fontSize: 11, color: colors.onBrandTertiary, fontWeight: "700" },
  selName: { fontSize: 15, color: colors.onBrandTertiary, fontWeight: "800", marginTop: 2 },
  selAddr: { fontSize: 12, color: colors.onBrandTertiary, opacity: 0.75 },
  clearBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.error,
  },

  errBox: {
    marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.error,
    flexDirection: "row", gap: 8, alignItems: "center",
  },
  errTxt: { flex: 1, color: colors.error, fontSize: 13, fontWeight: "600" },

  sectionTitle: {
    fontSize: 13, fontWeight: "800", color: colors.onSurface,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  devRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  devRowActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  devName: { fontWeight: "700", color: colors.onSurface, fontSize: 15 },
  devAddr: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
