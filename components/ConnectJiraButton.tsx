// components/ConnectJiraButton.tsx
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { TouchableOpacity, Text, Alert } from "react-native";
import { supabase } from "@/lib/supabase";

const FUNCTIONS_BASE =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE ||
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

type Props = { returnTo?: string };

export default function ConnectJiraButton({
  returnTo = "/blockers?refreshConnections=1",
}: Props) {
  const start = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) throw new Error("Not signed in");

      const deepLink = Linking.createURL(returnTo);

      const startUrl =
        `${FUNCTIONS_BASE}/oauth/jira/start` +
        `?access_token=${encodeURIComponent(jwt)}` +
        `&return_to=${encodeURIComponent(deepLink)}`;

      const res = await WebBrowser.openAuthSessionAsync(startUrl, deepLink);

      // Make absolutely sure we hit our deep link (some iOS versions are flaky)
      if (res.type === "success" && res.url) {
        await Linking.openURL(res.url);
      } else if (res.type === "dismiss") {
        await Linking.openURL(deepLink);
      }
    } catch (e: any) {
      Alert.alert("Jira", e?.message ?? "Could not start Jira connect.");
    }
  };

  return (
    <TouchableOpacity
      onPress={start}
      style={{
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
      }}
    >
      <Text style={{ fontWeight: "800", color: "#000" }}>Connect Jira</Text>
    </TouchableOpacity>
  );
}
