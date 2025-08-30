import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function EmptyState({ title, subtitle }:{title:string; subtitle?:string}) {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
    </View>
  );
}
const s = StyleSheet.create({
  wrap:{ padding:18, borderRadius:16, alignItems:"center", borderWidth:1, borderColor:"rgba(255,255,255,0.08)", backgroundColor:"rgba(255,255,255,0.04)" },
  title:{ color:"#e7e7e7", fontWeight:"600" },
  sub:{ color:"#a8a8a8", marginTop:6, fontSize:12, textAlign:"center" }
});
