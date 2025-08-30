import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function StatPill({
  icon = "flame",
  label,
  value,
}: { icon?: keyof typeof Ionicons.glyphMap; label: string; value: string | number; }) {
  return (
    <View style={s.wrap}>
      <Ionicons name={icon} size={14} color="#fff" style={{marginRight:6}} />
      <Text style={s.value}>{value}</Text>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flexDirection:"row", alignItems:"center", borderRadius:999, paddingVertical:6, paddingHorizontal:10, backgroundColor:"rgba(255,255,255,0.06)", borderWidth:1, borderColor:"rgba(255,255,255,0.08)" },
  value: { color:"#fff", fontWeight:"700", marginRight:6 },
  label: { color:"#bdbdbd", fontSize:12 }
});
