import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function ReactionBar({ onReact }:{ onReact?: (t:"like"|"done"|"comment")=>void }) {
  return (
    <View style={s.row}>
      <TouchableOpacity style={s.btn} onPress={()=>onReact?.("like")}><Ionicons name="heart-outline" size={16} color="#fff" /><Text style={s.txt}>Like</Text></TouchableOpacity>
      <TouchableOpacity style={s.btn} onPress={()=>onReact?.("comment")}><Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" /><Text style={s.txt}>Comment</Text></TouchableOpacity>
      <TouchableOpacity style={s.btn} onPress={()=>onReact?.("done")}><Ionicons name="checkmark-done-outline" size={16} color="#fff" /><Text style={s.txt}>Resolve</Text></TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  row:{ flexDirection:"row", justifyContent:"space-between", marginTop:6 },
  btn:{ flexDirection:"row", alignItems:"center", gap:6, paddingVertical:8, paddingHorizontal:10, borderRadius:10, borderColor:"rgba(255,255,255,0.08)", borderWidth:1, backgroundColor:"rgba(255,255,255,0.03)" },
  txt:{ color:"#dcdcdc", fontSize:12, marginLeft:6 }
});
