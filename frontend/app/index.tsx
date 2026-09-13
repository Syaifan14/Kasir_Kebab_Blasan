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
import { api } from "@/src/api";
import { colors } from "@/src/theme";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { user, setUser, loading: authLoading } = useAuth();
  const [role, setRole] = useState<"cashier" | "admin">("cashier");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("admin@kebabblasan.id");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      if (user.role === "cashier") router.replace("/cashier");
      else router.replace("/admin");
    }
  }, [authLoading, user]);

  const doPinLogin = async (finalPin: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api<any>("/auth/login-pin", {
        method: "POST",
        body: JSON.stringify({ pin: finalPin }),
      });
      await setUser(res);
      router.replace("/cashier");
    } catch (e: any) {
      setError("PIN salah. Coba lagi.");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const doAdminLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api<any>("/auth/login-admin", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await setUser(res);
      router.replace("/admin");
    } catch (e: any) {
      setError("Email atau password salah.");
    } finally {
      setLoading(false);
    }
  };

  const pressKey = (k: string) => {
    setError(null);
    if (k === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      doPinLogin(next);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <View style={styles.logoWrap}>
              <Icon name="food" size={38} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brandName}>Kebab Blasan</Text>
            <Text style={styles.brandTag}>Point of Sale</Text>
          </View>

          <View style={styles.roleSwitch} testID="role-switcher">
            <Pressable
              style={[styles.roleBtn, role === "cashier" && styles.roleBtnActive]}
              onPress={() => {
                setRole("cashier");
                setError(null);
              }}
              testID="role-cashier"
            >
              <Icon
                name="cash-register"
                size={18}
                color={role === "cashier" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
              />
              <Text style={[styles.roleTxt, role === "cashier" && styles.roleTxtActive]}>Kasir</Text>
            </Pressable>
            <Pressable
              style={[styles.roleBtn, role === "admin" && styles.roleBtnActive]}
              onPress={() => {
                setRole("admin");
                setError(null);
              }}
              testID="role-admin"
            >
              <Icon
                name="shield-account"
                size={18}
                color={role === "admin" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
              />
              <Text style={[styles.roleTxt, role === "admin" && styles.roleTxtActive]}>Admin</Text>
            </Pressable>
          </View>

          {role === "cashier" ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Masukkan PIN Kasir</Text>
              <Text style={styles.cardSub}>Demo PIN: 1234</Text>

              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[styles.dot, i < pin.length && styles.dotFilled]}
                  />
                ))}
              </View>
              {error ? <Text style={styles.err} testID="login-error">{error}</Text> : null}

              <View style={styles.pad}>
                {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "del"]].map((row, ri) => (
                  <View key={ri} style={styles.padRow}>
                    {row.map((k, ki) => {
                      if (k === "") return <View key={ki} style={styles.keyEmpty} />;
                      return (
                        <Pressable
                          key={ki}
                          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                          onPress={() => pressKey(k)}
                          testID={`pin-key-${k}`}
                          disabled={loading}
                        >
                          {k === "del" ? (
                            <Icon name="backspace-outline" size={26} color={colors.onSurface} />
                          ) : (
                            <Text style={styles.keyTxt}>{k}</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
              {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 8 }} /> : null}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Login Admin</Text>
              <Text style={styles.cardSub}>admin@kebabblasan.id / admin123</Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor={colors.muted}
                testID="admin-email"
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
                placeholderTextColor={colors.muted}
                testID="admin-password"
              />
              {error ? <Text style={styles.err}>{error}</Text> : null}
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                onPress={doAdminLogin}
                disabled={loading}
                testID="admin-login-btn"
              >
                {loading ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.primaryBtnTxt}>Masuk</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  scroll: { padding: 16, paddingBottom: 40 },
  brandBlock: { alignItems: "center", marginBottom: 20, marginTop: 8 },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  brandName: { fontSize: 26, fontWeight: "800", color: colors.onSurface, marginTop: 12 },
  brandTag: { fontSize: 13, color: colors.muted, marginTop: 2, letterSpacing: 1 },

  roleSwitch: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
  },
  roleBtnActive: { backgroundColor: colors.brandPrimary },
  roleTxt: { fontWeight: "600", color: colors.onSurfaceSecondary },
  roleTxtActive: { color: colors.onBrandPrimary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 4, marginBottom: 16 },

  pinDots: { flexDirection: "row", justifyContent: "center", gap: 14, marginVertical: 20 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  dotFilled: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },

  pad: { gap: 10 },
  padRow: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: colors.brandTertiary },
  keyEmpty: { flex: 1, height: 64 },
  keyTxt: { fontSize: 26, fontWeight: "700", color: colors.onSurface },
  err: { color: colors.error, textAlign: "center", marginTop: 8, fontWeight: "600" },

  label: { fontSize: 12, color: colors.muted, marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.brandPrimary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});
