import React from "react";
import { View, Image, StyleSheet } from "react-native";

export default function AvatarStack({ urls=[] as string[], size=28 }:{urls:string[]; size?:number}) {
  return (
    <View style={{flexDirection:"row"}}>
      {urls.slice(0,5).map((u, i) => (
        <Image key={u+i} source={{uri:u}} style={[st.img,{width:size,height:size, left: i===0?0:-i*(size/2)}]} />
      ))}
    </View>
  );
}
const st = StyleSheet.create({
  img: { borderRadius:999, borderWidth:2, borderColor:"#0a0a0a", position:"relative" }
});
