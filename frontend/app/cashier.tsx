import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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

type Product = { id: string; name: string; category: string; price: number; image_url?: string; active: boolean };
type Topping = { id: string; name: string; price: number; available: boolean };
type CartToppingItem = { id: string; name: string; price: number };
type CartItem = {
  key: string;
  product_id: string;
  product_name: string;
  base_price: number;
  variant?: string;
  toppings: CartToppingItem[];
  spice_level?: string;
  notes?: string;
  quantity: number;
  line_total: number;
};

const CATS = ["Semua", "Kebab", "Snacks", "Beverages"] as const;
const SPICE = ["Tidak Pedas", "Sedang", "Ekstra Pedas"] as const;
const DENOMS = [20000, 50000, 100000];

function calcLine(basePrice: number, toppings: CartToppingItem[], qty: number) {
  return (basePrice + toppings.reduce((a, t) => a + t.price, 0)) * qty;
}

export default function Cashier() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [cat, setCat] = useState<string>("Semua");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);

  // shift state
  const [shift, setShift] = useState<any>(null);
  const [showShiftStart, setShowShiftStart] = useState(false);
  const [openingCashText, setOpeningCashText] = useState("");

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    (async () => {
      try {
        const [ps, ts, sh] = await Promise.all([
          api<Product[]>("/products?active_only=true"),
          api<Topping[]>("/toppings"),
          api<any>(`/shifts/active?cashier_id=${user.user_id}`),
        ]);
        setProducts(ps);
        setToppings(ts);
        setShift(sh);
        if (!sh) setShowShiftStart(true);
      } catch (e) {
        console.log("load err", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const catOk = cat === "Semua" || p.category === cat;
      const qOk = !q || p.name.toLowerCase().includes(q.toLowerCase());
      return catOk && qOk;
    });
  }, [products, cat, q]);

  const subtotal = cart.reduce((a, c) => a + c.line_total, 0);
  const cartCount = cart.reduce((a, c) => a + c.quantity, 0);

  const addCartItem = (item: CartItem) => {
    setCart((c) => [...c, item]);
  };
  const updateQty = (k: string, delta: number) => {
    setCart((c) =>
      c
        .map((it) => {
          if (it.key !== k) return it;
          const nq = Math.max(0, it.quantity + delta);
          return { ...it, quantity: nq, line_total: calcLine(it.base_price, it.toppings, nq) };
        })
        .filter((it) => it.quantity > 0),
    );
  };
  const clearCart = () => setCart([]);

  const startShift = async () => {
    if (!user) return;
    const opening = parseInt(openingCashText || "0", 10);
    const s = await api<any>("/shifts/start", {
      method: "POST",
      body: JSON.stringify({ cashier_id: user.user_id, cashier_name: user.name, opening_cash: opening }),
    });
    setShift(s);
    setShowShiftStart(false);
  };

  const doLogout = async () => {
    await logout();
    router.replace("/");
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
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Kebab Blasan</Text>
          <Text style={styles.hSub}>
            {user?.name} · {shift ? `Shift aktif` : "Belum ada shift"}
          </Text>
        </View>
        <Pressable style={styles.hIconBtn} onPress={() => router.push("/recap")} testID="btn-recap">
          <Icon name="chart-box-outline" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={styles.hIconBtn} onPress={doLogout} testID="btn-logout">
          <Icon name="logout" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput
          placeholder="Cari menu..."
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
          testID="search-input"
        />
      </View>

      {/* Categories chip row */}
      <View style={styles.chipsBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CATS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCat(c)}
              style={[styles.chip, cat === c && styles.chipActive]}
              testID={`chip-${c}`}
            >
              <Text style={[styles.chipTxt, cat === c && styles.chipTxtActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Product grid */}
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 4, gap: 12 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.productCard}
            onPress={() => setCustomizingProduct(item)}
            testID={`product-${item.id}`}
          >
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.productImg} />
            ) : (
              <View style={[styles.productImg, { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary }]}>
                <Icon name="food-drumstick" size={36} color={colors.onBrandTertiary} />
              </View>
            )}
            <View style={{ padding: 10 }}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productPrice}>{formatIDR(item.price)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40 }}>
            <Icon name="food-off" size={40} color={colors.muted} />
            <Text style={{ color: colors.muted, marginTop: 8 }}>Tidak ada menu</Text>
          </View>
        }
      />

      {/* Cart floating button */}
      {cart.length > 0 && (
        <Pressable
          style={[styles.fabCart, { bottom: insets.bottom + 20 }]}
          onPress={() => setShowCart(true)}
          testID="fab-cart"
        >
          <Icon name="cart" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.fabTxt}>{cartCount} item · {formatIDR(subtotal)}</Text>
          <Icon name="chevron-right" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      )}

      {/* Customization modal */}
      <CustomizeModal
        product={customizingProduct}
        toppings={toppings}
        onClose={() => setCustomizingProduct(null)}
        onAdd={(item) => {
          addCartItem(item);
          setCustomizingProduct(null);
        }}
      />

      {/* Cart modal */}
      <CartModal
        visible={showCart}
        cart={cart}
        subtotal={subtotal}
        onClose={() => setShowCart(false)}
        onQty={updateQty}
        onCheckout={() => {
          setShowCart(false);
          setShowCheckout(true);
        }}
      />

      {/* Checkout modal */}
      <CheckoutModal
        visible={showCheckout}
        cart={cart}
        subtotal={subtotal}
        cashierName={user?.name || ""}
        cashierId={user?.user_id || ""}
        shiftId={shift?.id}
        onClose={() => setShowCheckout(false)}
        onDone={() => {
          setShowCheckout(false);
          clearCart();
        }}
      />

      {/* Start shift modal */}
      <Modal visible={showShiftStart} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.centerCard}>
            <Icon name="cash-100" size={44} color={colors.brandPrimary} />
            <Text style={styles.centerTitle}>Buka Shift</Text>
            <Text style={styles.centerSub}>Masukkan modal kas awal untuk memulai shift</Text>
            <TextInput
              placeholder="Rp 0"
              placeholderTextColor={colors.muted}
              value={openingCashText}
              onChangeText={setOpeningCashText}
              keyboardType="number-pad"
              style={styles.bigInput}
              testID="opening-cash-input"
            />
            <Pressable style={styles.primaryBtn} onPress={startShift} testID="btn-start-shift">
              <Text style={styles.primaryBtnTxt}>Mulai Shift</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ================ CUSTOMIZE MODAL ================ */
function CustomizeModal({
  product,
  toppings,
  onClose,
  onAdd,
}: {
  product: Product | null;
  toppings: Topping[];
  onClose: () => void;
  onAdd: (i: CartItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selTop, setSelTop] = useState<Set<string>>(new Set());
  const [spice, setSpice] = useState<string>("Tidak Pedas");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setSelTop(new Set());
    setSpice("Tidak Pedas");
    setNotes("");
    setQty(1);
  }, [product?.id]);

  if (!product) return null;

  const selectedToppings: CartToppingItem[] = toppings
    .filter((t) => selTop.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, price: t.price }));

  const line = calcLine(product.price, selectedToppings, qty);

  const toggleTop = (id: string) => {
    setSelTop((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = () => {
    onAdd({
      key: Math.random().toString(36).slice(2),
      product_id: product.id,
      product_name: product.name,
      base_price: product.price,
      toppings: selectedToppings,
      spice_level: spice,
      notes: notes || undefined,
      quantity: qty,
      line_total: line,
    });
  };

  return (
    <Modal visible={!!product} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{product.name}</Text>
              <Text style={styles.sheetSub}>{formatIDR(product.price)}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} testID="customize-close">
              <Icon name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Topping (opsional)</Text>
            <View style={styles.toppingGrid}>
              {toppings.map((t) => {
                const sel = selTop.has(t.id);
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => toggleTop(t.id)}
                    style={[styles.topPill, sel && styles.topPillActive]}
                    testID={`topping-${t.id}`}
                  >
                    <Icon
                      name={sel ? "check-circle" : "plus-circle-outline"}
                      size={18}
                      color={sel ? colors.onBrandPrimary : colors.brandSecondary}
                    />
                    <Text style={[styles.topName, sel && { color: colors.onBrandPrimary }]}>{t.name}</Text>
                    <Text style={[styles.topPrice, sel && { color: colors.onBrandPrimary }]}>
                      +{formatIDR(t.price)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Level Pedas</Text>
            <View style={styles.rowGap}>
              {SPICE.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSpice(s)}
                  style={[styles.optBtn, spice === s && styles.optBtnActive]}
                  testID={`spice-${s}`}
                >
                  <Text style={[styles.optTxt, spice === s && styles.optTxtActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Catatan</Text>
            <TextInput
              placeholder="Contoh: Tanpa bawang bombay"
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              style={styles.notesInput}
              multiline
              testID="notes-input"
            />

            <Text style={styles.sectionLabel}>Jumlah</Text>
            <View style={styles.qtyRow}>
              <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))} testID="qty-minus">
                <Icon name="minus" size={20} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.qtyVal}>{qty}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => q + 1)} testID="qty-plus">
                <Icon name="plus" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
          </ScrollView>

          <Pressable style={styles.primaryBtn} onPress={submit} testID="add-to-cart">
            <Text style={styles.primaryBtnTxt}>Tambah ke Cart · {formatIDR(line)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ================ CART MODAL ================ */
function CartModal({
  visible,
  cart,
  subtotal,
  onClose,
  onQty,
  onCheckout,
}: {
  visible: boolean;
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onQty: (k: string, d: number) => void;
  onCheckout: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "88%" }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Cart ({cart.length})</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView>
            {cart.map((c) => (
              <View key={c.key} style={styles.cartRow} testID={`cart-item-${c.key}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartName}>{c.product_name}</Text>
                  <Text style={styles.cartBase}>Base: {formatIDR(c.base_price)}</Text>
                  {c.toppings.map((t) => (
                    <Text key={t.id} style={styles.cartTop}>
                      + {t.name} ({formatIDR(t.price)})
                    </Text>
                  ))}
                  {c.spice_level ? <Text style={styles.cartMeta}>Pedas: {c.spice_level}</Text> : null}
                  {c.notes ? <Text style={styles.cartMeta}>Catatan: {c.notes}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={styles.cartTotal}>{formatIDR(c.line_total)}</Text>
                  <View style={styles.qtyRowSm}>
                    <Pressable style={styles.qtyBtnSm} onPress={() => onQty(c.key, -1)} testID={`cart-minus-${c.key}`}>
                      <Icon name="minus" size={14} color={colors.onSurface} />
                    </Pressable>
                    <Text style={styles.qtyValSm}>{c.quantity}</Text>
                    <Pressable style={styles.qtyBtnSm} onPress={() => onQty(c.key, 1)} testID={`cart-plus-${c.key}`}>
                      <Icon name="plus" size={14} color={colors.onSurface} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            {cart.length === 0 && <Text style={{ textAlign: "center", color: colors.muted, padding: 30 }}>Cart kosong</Text>}
          </ScrollView>

          <View style={styles.subtotalRow}>
            <Text style={styles.subLabel}>Subtotal</Text>
            <Text style={styles.subVal}>{formatIDR(subtotal)}</Text>
          </View>
          <Pressable style={[styles.primaryBtn, { opacity: cart.length ? 1 : 0.5 }]} onPress={onCheckout} disabled={!cart.length} testID="btn-checkout">
            <Text style={styles.primaryBtnTxt}>Bayar Sekarang</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ================ CHECKOUT MODAL ================ */
function CheckoutModal({
  visible,
  cart,
  subtotal,
  cashierName,
  cashierId,
  shiftId,
  onClose,
  onDone,
}: {
  visible: boolean;
  cart: CartItem[];
  subtotal: number;
  cashierName: string;
  cashierId: string;
  shiftId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<"cash" | "qris">("cash");
  const [cashText, setCashText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      setMethod("cash");
      setCashText("");
      setReceipt(null);
    }
  }, [visible]);

  const cashReceived = parseInt(cashText || "0", 10);
  const change = method === "cash" ? Math.max(0, cashReceived - subtotal) : 0;
  const canPay = method === "qris" || cashReceived >= subtotal;

  const setDenom = (v: number | "exact") => {
    if (v === "exact") setCashText(String(subtotal));
    else setCashText(String(v));
  };

  const submit = async () => {
    setProcessing(true);
    try {
      const payload = {
        items: cart.map((c) => ({
          product_id: c.product_id,
          product_name: c.product_name,
          base_price: c.base_price,
          variant: c.variant,
          toppings: c.toppings,
          spice_level: c.spice_level,
          notes: c.notes,
          quantity: c.quantity,
          line_total: c.line_total,
        })),
        subtotal,
        discount: 0,
        total: subtotal,
        payment_method: method,
        cash_received: method === "cash" ? cashReceived : null,
        change: method === "cash" ? change : null,
        cashier_id: cashierId,
        cashier_name: cashierName,
        shift_id: shiftId,
      };
      const r = await api<any>("/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setReceipt(r);
    } catch (e) {
      console.log("checkout err", e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "92%" }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{receipt ? "Struk" : "Pembayaran"}</Text>
              <Pressable onPress={receipt ? onDone : onClose} style={styles.closeBtn} testID="checkout-close">
                <Icon name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            {receipt ? (
              <ScrollView>
                <Receipt txn={receipt} />
                <Pressable style={styles.primaryBtn} onPress={onDone} testID="btn-finish-txn">
                  <Text style={styles.primaryBtnTxt}>Selesai</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <ScrollView>
                <View style={styles.rowGap}>
                  <Pressable
                    style={[styles.payBtn, method === "cash" && styles.payBtnActive]}
                    onPress={() => setMethod("cash")}
                    testID="pay-cash"
                  >
                    <Icon name="cash" size={22} color={method === "cash" ? colors.onBrandPrimary : colors.onSurface} />
                    <Text style={[styles.payTxt, method === "cash" && { color: colors.onBrandPrimary }]}>Tunai</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.payBtn, method === "qris" && styles.payBtnActive]}
                    onPress={() => setMethod("qris")}
                    testID="pay-qris"
                  >
                    <Icon name="qrcode" size={22} color={method === "qris" ? colors.onBrandPrimary : colors.onSurface} />
                    <Text style={[styles.payTxt, method === "qris" && { color: colors.onBrandPrimary }]}>QRIS</Text>
                  </Pressable>
                </View>

                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalVal}>{formatIDR(subtotal)}</Text>
                </View>

                {method === "cash" && (
                  <>
                    <Text style={styles.sectionLabel}>Uang Diterima</Text>
                    <TextInput
                      value={cashText}
                      onChangeText={setCashText}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      style={styles.bigInput}
                      testID="cash-input"
                    />
                    <View style={styles.rowGap}>
                      {DENOMS.map((d) => (
                        <Pressable key={d} style={styles.denomBtn} onPress={() => setDenom(d)} testID={`denom-${d}`}>
                          <Text style={styles.denomTxt}>{formatIDR(d)}</Text>
                        </Pressable>
                      ))}
                      <Pressable style={[styles.denomBtn, { backgroundColor: colors.brandTertiary }]} onPress={() => setDenom("exact")} testID="denom-exact">
                        <Text style={[styles.denomTxt, { color: colors.onBrandTertiary }]}>Uang Pas</Text>
                      </Pressable>
                    </View>

                    <View style={styles.changeRow}>
                      <Text style={styles.subLabel}>Kembalian</Text>
                      <Text style={[styles.subVal, { color: change > 0 ? colors.success : colors.onSurface }]}>{formatIDR(change)}</Text>
                    </View>
                  </>
                )}

                {method === "qris" && (
                  <View style={styles.qrisBox}>
                    <View style={styles.qrPlaceholder}>
                      <Icon name="qrcode-scan" size={100} color={colors.onSurface} />
                    </View>
                    <Text style={styles.qrisNote}>Tunjukkan QRIS ke pelanggan untuk dipindai</Text>
                  </View>
                )}

                <Pressable
                  style={[styles.primaryBtn, { opacity: canPay && !processing ? 1 : 0.5 }]}
                  onPress={submit}
                  disabled={!canPay || processing}
                  testID="btn-finalize"
                >
                  {processing ? (
                    <ActivityIndicator color={colors.onBrandPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Selesaikan Transaksi</Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ================ RECEIPT ================ */
function Receipt({ txn }: { txn: any }) {
  const t = new Date(txn.created_at);
  return (
    <View style={styles.receipt} testID="receipt-view">
      <Text style={styles.rTitle}>KEBAB BLASAN</Text>
      <Text style={styles.rTag}>Struk Pembelian</Text>
      <Text style={styles.rMeta}>No: {txn.order_no}</Text>
      <Text style={styles.rMeta}>Kasir: {txn.cashier_name}</Text>
      <Text style={styles.rMeta}>{t.toLocaleString("id-ID")}</Text>
      <Text style={styles.rDivider}>--------------------------------</Text>
      {txn.items.map((it: any, idx: number) => (
        <View key={idx} style={{ marginBottom: 6 }}>
          <View style={styles.rLine}>
            <Text style={styles.rItem}>{it.quantity}x {it.product_name}</Text>
            <Text style={styles.rItem}>{formatIDR(it.base_price * it.quantity)}</Text>
          </View>
          {it.toppings?.map((tp: any, i: number) => (
            <View key={i} style={styles.rLine}>
              <Text style={styles.rSub}>  + {tp.name}</Text>
              <Text style={styles.rSub}>{formatIDR(tp.price * it.quantity)}</Text>
            </View>
          ))}
          {it.spice_level ? <Text style={styles.rSub}>  Pedas: {it.spice_level}</Text> : null}
          {it.notes ? <Text style={styles.rSub}>  Note: {it.notes}</Text> : null}
        </View>
      ))}
      <Text style={styles.rDivider}>--------------------------------</Text>
      <View style={styles.rLine}>
        <Text style={styles.rTotalLabel}>TOTAL</Text>
        <Text style={styles.rTotalVal}>{formatIDR(txn.total)}</Text>
      </View>
      <View style={styles.rLine}>
        <Text style={styles.rItem}>Bayar ({txn.payment_method === "cash" ? "Tunai" : "QRIS"})</Text>
        <Text style={styles.rItem}>{formatIDR(txn.cash_received ?? txn.total)}</Text>
      </View>
      {txn.payment_method === "cash" && (
        <View style={styles.rLine}>
          <Text style={styles.rItem}>Kembali</Text>
          <Text style={styles.rItem}>{formatIDR(txn.change ?? 0)}</Text>
        </View>
      )}
      <Text style={styles.rDivider}>--------------------------------</Text>
      <Text style={styles.rThanks}>Terima kasih!</Text>
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
    gap: 8,
  },
  hTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  hIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: { flex: 1, height: 44, color: colors.onSurface, fontSize: 15 },

  chipsBlock: { height: 56, justifyContent: "center" },
  chipsRow: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: colors.onBrandPrimary },

  productCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  productImg: { width: "100%", height: 110, backgroundColor: colors.surfaceTertiary },
  productName: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  productPrice: { color: colors.brandSecondary, fontWeight: "700", marginTop: 4, fontSize: 14 },

  fabCart: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: colors.brandPrimary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabTxt: { color: colors.onBrandPrimary, fontWeight: "700", flex: 1, fontSize: 15 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: "92%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sheetSub: { fontSize: 14, color: colors.brandSecondary, fontWeight: "600", marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },

  sectionLabel: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: colors.onSurface },
  toppingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topPillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  topName: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  topPrice: { fontSize: 12, color: colors.muted },

  rowGap: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  optBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  optTxtActive: { color: colors.onBrandPrimary },

  notesInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12,
    minHeight: 60, textAlignVertical: "top", color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },

  qtyRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  qtyBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
  qtyVal: { fontSize: 18, fontWeight: "700", minWidth: 30, textAlign: "center", color: colors.onSurface },

  qtyRowSm: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtnSm: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
  qtyValSm: { fontSize: 14, fontWeight: "700", minWidth: 20, textAlign: "center", color: colors.onSurface },

  primaryBtn: {
    marginTop: 16, backgroundColor: colors.brandPrimary, borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
  },
  primaryBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },

  cartRow: {
    flexDirection: "row", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 8,
  },
  cartName: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  cartBase: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cartTop: { fontSize: 12, color: colors.onSurfaceSecondary },
  cartMeta: { fontSize: 12, color: colors.muted, fontStyle: "italic" },
  cartTotal: { fontWeight: "700", color: colors.brandSecondary },

  subtotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, marginTop: 8 },
  subLabel: { color: colors.onSurfaceSecondary, fontSize: 14 },
  subVal: { fontWeight: "800", fontSize: 18, color: colors.onSurface },

  payBtn: {
    flex: 1, flexDirection: "row", gap: 8, paddingVertical: 16,
    borderRadius: 14, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  payBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  payTxt: { fontWeight: "700", fontSize: 15, color: colors.onSurface },

  totalBox: {
    marginTop: 16, padding: 16, backgroundColor: colors.brandTertiary, borderRadius: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  totalLabel: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 14 },
  totalVal: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: 22 },

  bigInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14,
    fontSize: 18, fontWeight: "700", color: colors.onSurface, marginTop: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  denomBtn: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  denomTxt: { fontWeight: "700", color: colors.onSurface },

  changeRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 14, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.divider,
  },

  qrisBox: { alignItems: "center", padding: 20 },
  qrPlaceholder: {
    width: 200, height: 200, backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 2, borderColor: colors.onSurface, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  qrisNote: { color: colors.muted, marginTop: 12, textAlign: "center" },

  receipt: {
    backgroundColor: "#FFFEF9",
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rTitle: { textAlign: "center", fontWeight: "800", fontSize: 18, color: "#111", letterSpacing: 1 },
  rTag: { textAlign: "center", fontSize: 12, color: "#666", marginBottom: 6 },
  rMeta: { fontSize: 12, color: "#333", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  rDivider: { textAlign: "center", color: "#666", marginVertical: 6 },
  rLine: { flexDirection: "row", justifyContent: "space-between" },
  rItem: { fontSize: 12, color: "#111", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  rSub: { fontSize: 11, color: "#666", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  rTotalLabel: { fontWeight: "800", fontSize: 14, color: "#111" },
  rTotalVal: { fontWeight: "800", fontSize: 14, color: "#111" },
  rThanks: { textAlign: "center", fontSize: 12, color: "#111", marginTop: 4 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  centerCard: {
    width: "100%", maxWidth: 400, backgroundColor: colors.surface, borderRadius: 20,
    padding: 24, alignItems: "center",
  },
  centerTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 12 },
  centerSub: { fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 4, marginBottom: 8 },
});
