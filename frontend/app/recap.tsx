import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { api, formatIDR } from "@/src/api";
import { colors } from "@/src/theme";

export default function Recap() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [shift, setShift] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [countedText, setCountedText] = useState("");
  const [closing, setClosing] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const sh = await api<any>(`/shifts/active?cashier_id=${user.user_id}`);
      setShift(sh);
      if (sh) {
        const r = await api<any>(`/shifts/${sh.id}/report`);
        setReport(r);
      } else {
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    refresh();
  }, [user]);

  const closeShift = async () => {
    if (!shift) return;
    setClosing(true);
    try {
      const counted = parseInt(countedText || "0", 10);
      const s = await api<any>(`/shifts/${shift.id}/end`, {
        method: "POST",
        body: JSON.stringify({ counted_cash: counted }),
      });
      const r = await api<any>(`/shifts/${s.id}/report`);
      setShift(s);
      setReport(r);
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} testID="back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Rekap Harian</Text>
          <Text style={styles.hSub}>Z-Report Shift</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
          {!shift && !report ? (
            <View style={styles.emptyBox}>
              <Icon name="chart-line-variant" size={40} color={colors.muted} />
              <Text style={styles.emptyTxt}>Belum ada shift aktif.</Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.replace("/cashier")} testID="btn-open-shift">
                <Text style={styles.primaryBtnTxt}>Buka Shift</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.metricGrid}>
                <Metric label="Total Pendapatan" val={formatIDR(report?.total_revenue ?? 0)} accent />
                <Metric label="Transaksi" val={String(report?.transactions_count ?? 0)} />
                <Metric label="Cash" val={formatIDR(report?.total_cash ?? 0)} />
                <Metric label="QRIS" val={formatIDR(report?.total_qris ?? 0)} />
                <Metric label="Rata-rata Order" val={formatIDR(report?.average_order ?? 0)} />
                <Metric label="Modal Awal" val={formatIDR(report?.shift?.opening_cash ?? 0)} />
              </View>

              <Section title="Kas">
                <Row label="Modal Awal" val={formatIDR(report?.shift?.opening_cash ?? 0)} />
                <Row label="Penjualan Tunai" val={formatIDR(report?.total_cash ?? 0)} />
                <Row label="Sistem (Modal + Tunai)" val={formatIDR(report?.system_cash ?? 0)} bold />
                {shift?.status === "open" ? (
                  <>
                    <Text style={styles.inputLabel}>Uang Fisik Kasir</Text>
                    <TextInput
                      value={countedText}
                      onChangeText={setCountedText}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      style={styles.input}
                      testID="counted-cash-input"
                    />
                    <Pressable style={styles.dangerBtn} onPress={closeShift} disabled={closing} testID="btn-close-shift">
                      {closing ? (
                        <ActivityIndicator color={colors.onError} />
                      ) : (
                        <Text style={styles.dangerBtnTxt}>Tutup Shift</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Row label="Fisik Kasir" val={formatIDR(report?.counted_cash ?? 0)} />
                    <Row
                      label="Selisih Kas"
                      val={formatIDR(report?.variance ?? 0)}
                      valColor={
                        (report?.variance ?? 0) === 0
                          ? colors.success
                          : (report?.variance ?? 0) > 0
                          ? colors.info
                          : colors.error
                      }
                      bold
                    />
                  </>
                )}
              </Section>

              <Section title="Toppings Terjual">
                {(report?.toppings_sold ?? []).length === 0 ? (
                  <Text style={{ color: colors.muted }}>Belum ada topping terjual</Text>
                ) : (
                  report?.toppings_sold.map((t: any) => (
                    <Row key={t.name} label={t.name} val={`${t.qty} porsi`} />
                  ))
                )}
              </Section>

              <Section title="Menu Terjual">
                {(report?.products_sold ?? []).length === 0 ? (
                  <Text style={{ color: colors.muted }}>Belum ada penjualan</Text>
                ) : (
                  report?.products_sold.map((t: any) => (
                    <Row key={t.name} label={t.name} val={`${t.qty} porsi`} />
                  ))
                )}
              </Section>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Metric({ label, val, accent }: { label: string; val: string; accent?: boolean }) {
  return (
    <View style={[styles.metric, accent && { backgroundColor: colors.brandPrimary }]}>
      <Text style={[styles.metricLabel, accent && { color: colors.onBrandPrimary, opacity: 0.9 }]}>{label}</Text>
      <Text style={[styles.metricVal, accent && { color: colors.onBrandPrimary }]}>{val}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, val, bold, valColor }: { label: string; val: string; bold?: boolean; valColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowVal, bold && { fontWeight: "800" }, valColor && { color: valColor }]}>{val}</Text>
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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  hTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  emptyBox: {
    padding: 40, alignItems: "center",
    backgroundColor: colors.surface, borderRadius: 16, gap: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyTxt: { color: colors.onSurfaceSecondary, fontSize: 14 },

  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    flexGrow: 1, minWidth: "47%", padding: 14, borderRadius: 14,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  metricLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  metricVal: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginTop: 4 },

  section: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginTop: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 14 },
  rowVal: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },

  inputLabel: { fontSize: 12, color: colors.muted, marginTop: 10, marginBottom: 4, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16,
    color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },

  primaryBtn: {
    marginTop: 12, backgroundColor: colors.brandPrimary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24, alignItems: "center",
  },
  primaryBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  dangerBtn: {
    marginTop: 12, backgroundColor: colors.error, borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  dangerBtnTxt: { color: colors.onError, fontWeight: "700", fontSize: 15 },
});
