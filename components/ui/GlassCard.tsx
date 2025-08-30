import React from "react";
import { View, Text, ViewStyle, StyleSheet } from "react-native";

type Props = {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
  children?: React.ReactNode;
};
export default function GlassCard({ title, subtitle, right, style, children }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {(title || subtitle || right) && (
        <View style={styles.header}>
          <View style={{flex:1}}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      <View style={styles.body}>{children}</View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  title: { color: "#fff", fontSize: 16, fontWeight: "600" },
  subtitle: { color: "#a8a8a8", fontSize: 12, marginTop: 2 },
  body: { gap: 10 }
});
