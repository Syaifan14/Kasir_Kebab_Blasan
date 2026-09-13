import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { api, formatIDR } from "@/src/api";
import { colors } from "@/src/theme";
import { printReceipt, isBluetoothAvailable, bluetoothUnavailableReason } from "@/src/printer";

type Tab = "overview" | "menu" | "toppings" | "history";

export default function Admin() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!user) router.replace("/");
  }, [user]);

  const doLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Admin · Kebab Blasan</Text>
          <Text style={styles.hSub}>{user?.name}</Text>
        </View>
        <Pressable style={styles.hIconBtn} onPress={() => router.push("/printer-settings")} testID="btn-printer">
          <Icon name="printer-wireless" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={styles.hIconBtn} onPress={doLogout} testID="btn-logout">
          <Icon name="logout" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.tabsBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {([
            ["overview", "Ringkasan", "view-dashboard-outline"],
            ["menu", "Menu", "hamburger"],
            ["toppings", "Topping", "layers-outline"],
            ["history", "Riwayat", "history"],
          ] as [Tab, string, string][]).map(([t, l, ic]) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabChip, tab === t && styles.tabChipActive]}
              testID={`tab-${t}`}
            >
              <Icon name={ic} size={16} color={tab === t ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "overview" && <Overview />}
        {tab === "menu" && <MenuCrud />}
        {tab === "toppings" && <ToppingCrud />}
        {tab === "history" && <History />}
      </View>
    </View>
  );
}

/* ============== OVERVIEW ============== */
function Overview() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api<any>("/dashboard/metrics");
      setData(d);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;

  const maxDay = Math.max(1, ...(data?.weekly_chart || []).map((d: any) => d.total));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
      <View style={styles.metricGrid}>
        <Metric label="Pendapatan Hari Ini" val={formatIDR(data.today_revenue)} accent testID="metric-today-revenue" />
        <Metric label="Order Hari Ini" val={String(data.today_orders)} />
        <Metric label="Pendapatan Minggu Ini" val={formatIDR(data.week_revenue)} />
        <Metric label="Total Transaksi" val={String(data.total_transactions)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pendapatan 7 Hari Terakhir</Text>
        <View style={styles.chart}>
          {data.weekly_chart.map((d: any) => {
            const h = maxDay > 0 ? (d.total / maxDay) * 120 : 0;
            const day = new Date(d.date).toLocaleDateString("id-ID", { weekday: "short" });
            return (
              <View key={d.date} style={styles.chartCol}>
                <Text style={styles.chartVal}>{d.total > 0 ? Math.round(d.total / 1000) + "k" : ""}</Text>
                <View style={[styles.chartBar, { height: Math.max(4, h) }]} />
                <Text style={styles.chartDay}>{day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top 5 Menu</Text>
        {data.top_sellers.length === 0 ? (
          <Text style={{ color: colors.muted }}>Belum ada penjualan</Text>
        ) : (
          data.top_sellers.map((s: any, i: number) => (
            <View key={s.name} style={styles.topRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankTxt}>{i + 1}</Text>
              </View>
              <Text style={styles.topName}>{s.name}</Text>
              <Text style={styles.topQty}>{s.qty} porsi</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/* ============== MENU CRUD ============== */
function MenuCrud() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setItems(await api("/products"));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (payload: any) => {
    if (editing?.id) {
      await api(`/products/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/products", { method: "POST", body: JSON.stringify(payload) });
    }
    setEditing(null);
    load();
  };
  const del = async (id: string) => {
    await api(`/products/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100, gap: 8 }}
        renderItem={({ item }) => (
          <View style={styles.crudRow} testID={`menu-row-${item.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.crudName}>{item.name}</Text>
              <Text style={styles.crudMeta}>{item.category} · {formatIDR(item.price)}{!item.active ? " · Tidak Aktif" : ""}</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={() => setEditing(item)} testID={`edit-menu-${item.id}`}>
              <Icon name="pencil" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: colors.error }]} onPress={() => del(item.id)} testID={`del-menu-${item.id}`}>
              <Icon name="trash-can-outline" size={18} color={colors.onError} />
            </Pressable>
          </View>
        )}
      />
      <Pressable style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => setEditing({})} testID="fab-add-menu">
        <Icon name="plus" size={26} color={colors.onBrandPrimary} />
      </Pressable>
      <ProductForm value={editing} onClose={() => setEditing(null)} onSave={save} />
    </View>
  );
}

function ProductForm({ value, onClose, onSave }: { value: any | null; onClose: () => void; onSave: (p: any) => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Kebab");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (value) {
      setName(value.name || "");
      setCategory(value.category || "Kebab");
      setPrice(value.price != null ? String(value.price) : "");
      setActive(value.active !== false);
    }
  }, [value]);

  if (!value) return null;
  const canSave = name.trim() && !!parseInt(price || "0", 10);

  return (
    <Modal visible={!!value} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{value.id ? "Edit Menu" : "Menu Baru"}</Text>
            <Text style={styles.inputLabel}>Nama</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} testID="form-name" />
            <Text style={styles.inputLabel}>Kategori</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {["Kebab", "Snacks", "Beverages"].map((c) => (
                <Pressable
                  key={c}
                  style={[styles.optBtn, category === c && styles.optBtnActive]}
                  onPress={() => setCategory(c)}
                  testID={`form-cat-${c}`}
                >
                  <Text style={[styles.optTxt, category === c && styles.optTxtActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.inputLabel}>Harga (Rp)</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="number-pad" style={styles.input} testID="form-price" />
            <View style={styles.switchRow}>
              <Text style={styles.rowLabel}>Aktif</Text>
              <Switch value={active} onValueChange={setActive} thumbColor={colors.onBrandPrimary} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} testID="form-active" />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryBtnTxt}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { flex: 1, marginTop: 0, opacity: canSave ? 1 : 0.5 }]}
                disabled={!canSave}
                onPress={() =>
                  onSave({
                    name: name.trim(),
                    category,
                    price: parseInt(price || "0", 10),
                    image_url: value.image_url,
                    active,
                  })
                }
                testID="form-save"
              >
                <Text style={styles.primaryBtnTxt}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ============== TOPPING CRUD ============== */
function ToppingCrud() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setItems(await api("/toppings"));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (payload: any) => {
    if (editing?.id) await api(`/toppings/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/toppings", { method: "POST", body: JSON.stringify(payload) });
    setEditing(null);
    load();
  };
  const del = async (id: string) => {
    await api(`/toppings/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100, gap: 8 }}
        renderItem={({ item }) => (
          <View style={styles.crudRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.crudName}>{item.name}</Text>
              <Text style={styles.crudMeta}>+{formatIDR(item.price)}{!item.available ? " · Habis" : ""}</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={() => setEditing(item)} testID={`edit-top-${item.id}`}>
              <Icon name="pencil" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: colors.error }]} onPress={() => del(item.id)} testID={`del-top-${item.id}`}>
              <Icon name="trash-can-outline" size={18} color={colors.onError} />
            </Pressable>
          </View>
        )}
      />
      <Pressable style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => setEditing({})} testID="fab-add-topping">
        <Icon name="plus" size={26} color={colors.onBrandPrimary} />
      </Pressable>
      <ToppingForm value={editing} onClose={() => setEditing(null)} onSave={save} />
    </View>
  );
}

function ToppingForm({ value, onClose, onSave }: { value: any | null; onClose: () => void; onSave: (p: any) => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (value) {
      setName(value.name || "");
      setPrice(value.price != null ? String(value.price) : "");
      setAvailable(value.available !== false);
    }
  }, [value]);

  if (!value) return null;
  const canSave = name.trim() && parseInt(price || "0", 10) >= 0;

  return (
    <Modal visible={!!value} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{value.id ? "Edit Topping" : "Topping Baru"}</Text>
            <Text style={styles.inputLabel}>Nama</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} testID="top-name" />
            <Text style={styles.inputLabel}>Harga Tambahan</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="number-pad" style={styles.input} testID="top-price" />
            <View style={styles.switchRow}>
              <Text style={styles.rowLabel}>Tersedia</Text>
              <Switch value={available} onValueChange={setAvailable} thumbColor={colors.onBrandPrimary} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryBtnTxt}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { flex: 1, marginTop: 0, opacity: canSave ? 1 : 0.5 }]}
                disabled={!canSave}
                onPress={() =>
                  onSave({
                    name: name.trim(),
                    price: parseInt(price || "0", 10),
                    available,
                  })
                }
                testID="top-save"
              >
                <Text style={styles.primaryBtnTxt}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ============== HISTORY ============== */
function History() {
  const insets = useSafeAreaInsets();
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const url = q ? `/transactions?q=${encodeURIComponent(q)}` : "/transactions";
    setTxns(await api(url));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [q]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <View style={styles.searchWrap}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            placeholder="Cari nomor order..."
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            testID="hist-search"
          />
        </View>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 8 }}
          ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>Belum ada transaksi</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.txnRow} onPress={() => setSelected(item)} testID={`txn-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.crudName}>#{item.order_no}</Text>
                <Text style={styles.crudMeta}>
                  {new Date(item.created_at).toLocaleString("id-ID")} · {item.cashier_name}
                </Text>
                <Text style={styles.crudMeta}>{item.payment_method === "cash" ? "Tunai" : item.payment_method === "qris" ? "QRIS" : "Tunai + QRIS"}</Text>
              </View>
              <Text style={styles.txnAmount}>{formatIDR(item.total)}</Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "88%" }]}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[styles.sheetTitle, { flex: 1 }]}>Detail Order</Text>
              <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Icon name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {selected && (
              <ScrollView>
                <View style={styles.receipt}>
                  <Text style={styles.rTitle}>KEBAB BLASAN</Text>
                  <Text style={styles.rMeta}>No: {selected.order_no}</Text>
                  <Text style={styles.rMeta}>Kasir: {selected.cashier_name}</Text>
                  <Text style={styles.rMeta}>{new Date(selected.created_at).toLocaleString("id-ID")}</Text>
                  <Text style={styles.rDivider}>--------------------------------</Text>
                  {selected.items.map((it: any, i: number) => (
                    <View key={i} style={{ marginBottom: 4 }}>
                      <View style={styles.rLine}>
                        <Text style={styles.rItem}>{it.quantity}x {it.product_name}</Text>
                        <Text style={styles.rItem}>{formatIDR(it.base_price * it.quantity)}</Text>
                      </View>
                      {it.toppings?.map((tp: any, j: number) => (
                        <View key={j} style={styles.rLine}>
                          <Text style={styles.rSub}>  + {tp.name}</Text>
                          <Text style={styles.rSub}>{formatIDR(tp.price * it.quantity)}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  <Text style={styles.rDivider}>--------------------------------</Text>
                  {selected.discount > 0 && (
                    <>
                      <View style={styles.rLine}>
                        <Text style={styles.rItem}>Subtotal</Text>
                        <Text style={styles.rItem}>{formatIDR(selected.subtotal)}</Text>
                      </View>
                      <View style={styles.rLine}>
                        <Text style={styles.rItem}>Diskon{selected.voucher_code ? ` (${selected.voucher_code})` : ""}</Text>
                        <Text style={styles.rItem}>-{formatIDR(selected.discount)}</Text>
                      </View>
                    </>
                  )}
                  <View style={styles.rLine}>
                    <Text style={styles.rTotalLabel}>TOTAL</Text>
                    <Text style={styles.rTotalVal}>{formatIDR(selected.total)}</Text>
                  </View>
                  {selected.payment_method === "split" && (
                    <>
                      <View style={styles.rLine}>
                        <Text style={styles.rItem}>Tunai</Text>
                        <Text style={styles.rItem}>{formatIDR(selected.cash_amount || 0)}</Text>
                      </View>
                      <View style={styles.rLine}>
                        <Text style={styles.rItem}>QRIS</Text>
                        <Text style={styles.rItem}>{formatIDR(selected.qris_amount || 0)}</Text>
                      </View>
                    </>
                  )}
                </View>
                <ReprintButton txn={selected} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Metric({ label, val, accent, testID }: { label: string; val: string; accent?: boolean; testID?: string }) {
  return (
    <View style={[styles.metric, accent && { backgroundColor: colors.brandPrimary }]} testID={testID}>
      <Text style={[styles.metricLabel, accent && { color: colors.onBrandPrimary, opacity: 0.9 }]}>{label}</Text>
      <Text style={[styles.metricVal, accent && { color: colors.onBrandPrimary }]}>{val}</Text>
    </View>
  );
}

function ReprintButton({ txn }: { txn: any }) {
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);
  const [busy, setBusy] = useState(false);
  const available = isBluetoothAvailable();

  const doPrint = async () => {
    setBusy(true);
    setStatus(null);
    const r = await printReceipt(txn);
    setStatus({ ok: r.ok, msg: r.ok ? "Struk dicetak" : r.error || "Gagal mencetak" });
    setBusy(false);
  };

  return (
    <View style={{ marginTop: 12 }}>
      <Pressable
        style={[styles.printBtn, !available && { opacity: 0.6 }]}
        onPress={doPrint}
        disabled={busy}
        testID="btn-reprint"
      >
        {busy ? (
          <ActivityIndicator color={colors.onSurface} />
        ) : (
          <>
            <Icon name="printer-wireless" size={20} color={colors.onSurface} />
            <Text style={styles.printBtnTxt}>Cetak Ulang via Bluetooth</Text>
          </>
        )}
      </Pressable>
      {status && (
        <Text style={[styles.printStatus, { color: status.ok ? colors.success : colors.error }]}>
          {status.msg}
        </Text>
      )}
      {!available && (
        <Text style={styles.printStatus}>{bluetoothUnavailableReason()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  hTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  hIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },

  tabsBlock: { height: 56, justifyContent: "center" },
  tabsRow: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  tabChip: {
    height: 36, paddingHorizontal: 12, borderRadius: 999,
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    flexShrink: 0,
  },
  tabChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabTxt: { fontWeight: "600", color: colors.onSurfaceSecondary, fontSize: 13 },
  tabTxtActive: { color: colors.onBrandPrimary },

  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    flexGrow: 1, minWidth: "47%", padding: 14, borderRadius: 14,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  metricLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  metricVal: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 4 },

  section: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 10 },

  chart: { flexDirection: "row", justifyContent: "space-between", height: 170, paddingTop: 20 },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  chartBar: { width: 22, borderRadius: 6, backgroundColor: colors.brandPrimary },
  chartDay: { fontSize: 11, color: colors.muted, marginTop: 6 },
  chartVal: { fontSize: 10, color: colors.onSurfaceSecondary, marginBottom: 4 },

  topRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.divider, gap: 12,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rankTxt: { fontWeight: "800", color: colors.onBrandTertiary },
  topName: { flex: 1, fontWeight: "600", color: colors.onSurface },
  topQty: { color: colors.muted, fontSize: 13 },

  crudRow: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  crudName: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  crudMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },

  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, maxHeight: "92%",
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong,
    alignSelf: "center", marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: 8 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },

  inputLabel: { fontSize: 12, color: colors.muted, marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 15,
    color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 14 },
  switchRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 12, padding: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 12,
  },

  optBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  optBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  optTxtActive: { color: colors.onBrandPrimary },

  primaryBtn: {
    marginTop: 12, backgroundColor: colors.brandPrimary, borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  primaryBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: colors.surfaceTertiary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    alignItems: "center",
  },
  secondaryBtnTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.border, gap: 8, marginBottom: 8,
  },
  searchInput: { flex: 1, height: 44, color: colors.onSurface, fontSize: 15 },

  txnRow: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  txnAmount: { fontWeight: "800", color: colors.brandSecondary, fontSize: 15 },

  receipt: {
    backgroundColor: "#FFFEF9",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rTitle: { textAlign: "center", fontWeight: "800", fontSize: 16, color: "#111", letterSpacing: 1 },
  rMeta: { fontSize: 12, color: "#333", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  rDivider: { textAlign: "center", color: "#666", marginVertical: 6 },
  rLine: { flexDirection: "row", justifyContent: "space-between" },
  rItem: { fontSize: 12, color: "#111", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  rSub: { fontSize: 11, color: "#666", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  rTotalLabel: { fontWeight: "800", fontSize: 14, color: "#111" },
  rTotalVal: { fontWeight: "800", fontSize: 14, color: "#111" },

  printBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong,
  },
  printBtnTxt: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  printStatus: { textAlign: "center", marginTop: 6, fontSize: 12, color: colors.muted },
});
