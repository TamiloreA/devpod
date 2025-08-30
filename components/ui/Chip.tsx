import React from "react";
import { Text, View, StyleSheet } from "react-native";

export default function Chip({ text, tone="default" }:{text:string; tone?: "default"|"success"|"warning"|"danger"|"info"}) {
  const colors:any = {
    default: ["rgba(255,255,255,0.08)", "#cfcfcf"],
    success: ["rgba(34,197,94,0.15)", "#c4f5d6"],
    warning: ["rgba(245,158,11,0.15)", "#ffe0b3"],
    danger:  ["rgba(239,68,68,0.15)", "#ffc9c9"],
    info:    ["rgba(59,130,246,0.15)", "#cfe3ff"],
  };
  return (
    <View style={[s.wrap, {backgroundColor: colors[tone][0], borderColor: colors[tone][0]}]}>
      <Text style={[s.text, {color: colors[tone][1]}]}>{text}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { paddingVertical:6, paddingHorizontal:10, borderRadius:999, borderWidth:1, marginRight:6, marginBottom:6 },
  text: { fontSize:12, fontWeight:"600" }
});
