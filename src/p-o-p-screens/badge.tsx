// Use Helius DAS API to fetch cNFTs by owner (free tier available)

import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

// const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=YOUR_KEY";
const HELIUS_URL = process.env.EXPO_PUBLIC_HELIUS_URL;

export default function BadgesScreen() {
    const [badges, setBadges] = useState<any[]>([]);

    async function fetchBadges(ownerAddress: string) {
        const res = await fetch(HELIUS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "badges",
                method: "getAssetsByOwner",
                params: {
                    ownerAddress,
                    page: 1,
                    limit: 50,
                }
            })
        });
        const { result } = await res.json();
        // Filter by your symbol or collection
        const pop = result.items.filter((a: any) => a.content?.metadata?.symbol === "POP");
        setBadges(pop);
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>My Badges</Text>
            <FlatList
                data={badges}
                numColumns={2}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View style={styles.badge}>
                        <Text style={styles.badgeName}>{item.content?.metadata?.name}</Text>
                    </View>
                )}
            />
        </View>
    );    
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        padding: 16, 
        backgroundColor: "#0f0f23" 
    },
    title: { 
        fontSize: 24, 
        fontWeight: "bold", 
        color: "#9945FF", 
        marginBottom: 16 
    },
    badge: { 
        flex: 1, 
        margin: 8, 
        padding: 16, 
        backgroundColor: "#1a1a3e", 
        borderRadius: 12, 
        alignItems: "center" 
    },
    badgeName: { 
        color: "#fff", 
        textAlign: "center", 
        fontSize: 12 
    },
});  